import { SignJWT, importPKCS8 } from "jose";
import type { ChangeRequest, ChangedFile, Finding } from "@mergeguard/core";
import type { IndexedFile } from "@mergeguard/repo-intel";
import { prioritizeIndexPaths, shouldIndexPath } from "@mergeguard/repo-intel";
import { workerConfig } from "./config.js";
import { fetchWithRetry } from "./http.js";
import { asArray, asRecord, encodePath, mapLimit, readNumber, readString, shouldFetchHeadContent } from "./util.js";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const installationTokens = new Map<number, CachedToken>();

export async function githubInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokens.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const appId = workerConfig.githubAppId;
  const raw = workerConfig.githubPrivateKey;
  if (!appId || !raw) throw new Error("Missing GitHub App credentials");
  const pem = raw.replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 540)
    .sign(key);
  const response = await fetchWithRetry(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub installation token failed ${response.status}`);
  const body = asRecord(await response.json());
  const token = readString(body.token);
  if (!token) throw new Error("GitHub installation token response missing token");
  installationTokens.set(installationId, { token, expiresAt: Date.now() + 50 * 60_000 });
  return token;
}

export async function githubJson(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetchWithRetry(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} ${response.status}`);
  return response.json();
}

export async function normalizeGithub(payload: Record<string, unknown>, token: string): Promise<ChangeRequest> {
  const pullRequest = asRecord(payload.pull_request);
  const repository = asRecord(payload.repository);
  const owner = readString(asRecord(repository.owner).login);
  const name = readString(repository.name);
  const number = readNumber(pullRequest.number);
  const head = asRecord(pullRequest.head);
  const base = asRecord(pullRequest.base);
  const user = asRecord(pullRequest.user);
  const installation = asRecord(payload.installation);
  if (!owner || !name || !number) throw new Error("GitHub payload missing pull request identity");

  const files: ChangedFile[] = [];
  const rawFiles = await paginateGithubList(`/repos/${owner}/${name}/pulls/${number}/files?per_page=100`, token, workerConfig.maxChangedFiles);
  const selected = rawFiles.slice(0, workerConfig.maxChangedFiles).map(asRecord);

  const contents = await mapLimit(selected, workerConfig.indexFetchConcurrency, async (file) => {
    const filename = readString(file.filename);
    const status = readString(file.status);
    let headContent = "";
    if (status !== "removed" && shouldFetchHeadContent(filename)) {
      try {
        const content = asRecord(await githubJson(`/repos/${owner}/${name}/contents/${encodePath(filename)}?ref=${readString(head.sha)}`, token));
        if (content.encoding === "base64" && typeof content.content === "string") {
          headContent = Buffer.from(content.content, "base64").toString("utf8").slice(0, workerConfig.maxFileContentChars);
        }
      } catch {
        headContent = "";
      }
    }
    return { file, headContent };
  });

  for (const { file, headContent } of contents) {
    const status = readString(file.status);
    files.push({
      path: readString(file.filename),
      previousPath: typeof file.previous_filename === "string" ? file.previous_filename : undefined,
      status: status === "removed" ? "deleted" : status === "renamed" ? "renamed" : status === "added" ? "added" : "modified",
      additions: readNumber(file.additions),
      deletions: readNumber(file.deletions),
      patch: typeof file.patch === "string" ? file.patch : undefined,
      headContent,
    });
  }

  return {
    platform: "github",
    repository: {
      id: readString(repository.id),
      owner,
      name,
      defaultBranch: readString(repository.default_branch) || undefined,
      url: readString(repository.html_url) || undefined,
    },
    change: {
      id: readString(pullRequest.id),
      number,
      title: readString(pullRequest.title),
      description: readString(pullRequest.body),
      baseSha: readString(base.sha),
      headSha: readString(head.sha),
      author: { id: readString(user.id), username: readString(user.login) },
      url: readString(pullRequest.html_url) || undefined,
    },
    files,
    metadata: {
      draft: Boolean(pullRequest.draft),
      labels: asArray(pullRequest.labels).map((label) => readString(asRecord(label).name)).filter(Boolean),
      installationId: readString(installation.id) || undefined,
    },
  };
}

export async function indexGithub(change: ChangeRequest, token: string, sha: string): Promise<IndexedFile[]> {
  const tree = asRecord(await githubJson(`/repos/${change.repository.owner}/${change.repository.name}/git/trees/${sha}?recursive=1`, token));
  if (tree.truncated === true) {
    console.warn(JSON.stringify({ level: "warn", event: "github_tree_truncated", sha }));
  }
  const entries = asArray(tree.tree)
    .map(asRecord)
    .filter((item) => item.type === "blob" && typeof item.path === "string" && shouldIndexPath(item.path) && readNumber(item.size) <= workerConfig.indexMaxFileBytes)
    .map((item) => ({ path: readString(item.path), sha: readString(item.sha), size: readNumber(item.size) }));
  const chosen = prioritizeIndexPaths(entries, change.files.map((file) => file.path), workerConfig.indexMaxFiles);
  const fetched = await mapLimit(chosen, workerConfig.indexFetchConcurrency, async (entry) => {
    try {
      const blob = asRecord(await githubJson(`/repos/${change.repository.owner}/${change.repository.name}/git/blobs/${entry.sha}`, token));
      if (blob.encoding !== "base64" || typeof blob.content !== "string") return null;
      return {
        path: entry.path,
        content: Buffer.from(blob.content, "base64").toString("utf8").slice(0, workerConfig.indexMaxFileChars),
        size: entry.size,
      } satisfies IndexedFile;
    } catch {
      return null;
    }
  });
  return fetched.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function publishGithub(
  payload: Record<string, unknown>,
  token: string,
  analysisId: string,
  findings: Finding[],
  risk: { level: string; score: number },
): Promise<void> {
  const repository = asRecord(payload.repository);
  const owner = readString(asRecord(repository.owner).login);
  const name = readString(repository.name);
  const sha = readString(asRecord(asRecord(payload.pull_request).head).sha);
  const annotations = findings
    .filter((finding) => finding.startLine)
    .slice(0, 20)
    .map((finding) => ({
      path: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine || finding.startLine,
      annotation_level: finding.severity === "critical" || finding.severity === "high" ? "failure" : finding.severity === "medium" ? "warning" : "notice",
      title: finding.title,
      message: `${finding.description}\n\nConfidence: ${Math.round(finding.confidence * 100)}%${finding.remediation ? `\n\nSuggested fix: ${finding.remediation}` : ""}`.slice(0, 65000),
    }));
  await githubJson(`/repos/${owner}/${name}/check-runs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "MergeGuard",
      head_sha: sha,
      status: "completed",
      conclusion: findings.some((finding) => finding.severity === "critical" && finding.confidence >= 0.9) ? "failure" : "neutral",
      output: {
        title: `MergeGuard: ${String(risk.level).toUpperCase()} risk`,
        summary: reviewSummary(findings, risk),
        annotations,
      },
      details_url: `${workerConfig.webUrl}/analyses/${analysisId}`,
    }),
  });
}

export function reviewSummary(findings: Finding[], risk: { level: string; score: number }): string {
  const top = findings.slice(0, 10);
  return `## MergeGuard review\n\n**Overall risk: ${String(risk.level).toUpperCase()} (${risk.score}/100)**\n\n${
    top.length
      ? top
          .map(
            (finding) =>
              `- **${finding.severity.toUpperCase()} · ${finding.category} · ${Math.round(finding.confidence * 100)}%** — ${finding.title} (${finding.file}${finding.startLine ? `:${finding.startLine}` : ""})`,
          )
          .join("\n")
      : "No reportable high-confidence issues found."
  }\n\n> MergeGuard reports potential issues, not proofs. Validate findings in repository context.`;
}

async function paginateGithubList(path: string, token: string, max: number): Promise<unknown[]> {
  const items: unknown[] = [];
  let next = path;
  while (next && items.length < max) {
    const response = await fetchWithRetry(`https://api.github.com${next}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub ${next} ${response.status}`);
    const page = asArray(await response.json());
    items.push(...page);
    const link = response.headers.get("link") ?? "";
    const match = link.match(/<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/);
    next = match ? match[1]! : "";
    if (page.length === 0) break;
  }
  return items.slice(0, max);
}
