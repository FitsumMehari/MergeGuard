import type { ChangeRequest, ChangedFile, Finding } from "@mergeguard/core";
import type { IndexedFile } from "@mergeguard/repo-intel";
import { prioritizeIndexPaths, shouldIndexPath } from "@mergeguard/repo-intel";
import { workerConfig } from "./config.js";
import { fetchWithRetry } from "./http.js";
import { reviewSummary } from "./github.js";
import { asArray, asRecord, mapLimit, readNumber, readString, shouldFetchHeadContent } from "./util.js";

function gitlabTokenFor(projectId: string): string {
  const token = workerConfig.gitlabProjectTokens[projectId] || workerConfig.gitlabToken;
  if (!token) throw new Error(`Missing GITLAB_TOKEN for project ${projectId}`);
  return token;
}

function gitlabHeaders(projectId: string): Record<string, string> {
  return { "PRIVATE-TOKEN": gitlabTokenFor(projectId) };
}

export async function normalizeGitlab(payload: Record<string, unknown>): Promise<ChangeRequest> {
  const project = asRecord(payload.project);
  const mergeRequest = asRecord(payload.object_attributes);
  const lastCommit = asRecord(mergeRequest.last_commit);
  const diffRefs = asRecord(mergeRequest.diff_refs);
  const projectId = readString(project.id);
  const iid = readNumber(mergeRequest.iid);
  if (!projectId || !iid) throw new Error("GitLab payload missing merge request identity");
  const headSha = readString(diffRefs.head_sha, readString(lastCommit.id));
  const baseSha = readString(
    diffRefs.base_sha,
    readString(asRecord(asRecord(mergeRequest.target).last_commit).id, readString(mergeRequest.oldrev, headSha)),
  );

  const raw = await paginateGitlab(
    `${workerConfig.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/diffs?per_page=100`,
    workerConfig.maxChangedFiles,
    "GitLab diffs failed",
    projectId,
  );
  const files: ChangedFile[] = raw.map((file) => ({
    path: readString(file.new_path),
    previousPath: readString(file.old_path) || undefined,
    status: file.deleted_file ? "deleted" : file.renamed_file ? "renamed" : file.new_file ? "added" : "modified",
    patch: typeof file.diff === "string" ? file.diff : undefined,
  }));

  await mapLimit(files, workerConfig.indexFetchConcurrency, async (file) => {
    if (file.status === "deleted" || !shouldFetchHeadContent(file.path)) return;
    try {
      const rawFile = await fetchWithRetry(
        `${workerConfig.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(file.path)}/raw?ref=${encodeURIComponent(headSha)}`,
        { headers: gitlabHeaders(projectId) },
      );
      if (rawFile.ok) file.headContent = (await rawFile.text()).slice(0, workerConfig.maxFileContentChars);
    } catch {
      /* head content is optional for pattern detectors that can use the patch */
    }
  });

  const namespace = readString(project.path_with_namespace, readString(project.name)).split("/");
  const user = asRecord(payload.user);
  return {
    platform: "gitlab",
    repository: {
      id: projectId,
      owner: namespace.slice(0, -1).join("/"),
      name: namespace.at(-1) || projectId,
      defaultBranch: readString(project.default_branch) || undefined,
      url: readString(project.web_url) || undefined,
    },
    change: {
      id: readString(mergeRequest.id),
      number: iid,
      title: readString(mergeRequest.title),
      description: readString(mergeRequest.description),
      baseSha,
      headSha,
      author: { id: readString(user.id), username: readString(user.username) },
      url: readString(mergeRequest.url) || undefined,
    },
    files,
    metadata: {
      draft: Boolean(mergeRequest.draft),
      labels: asArray(payload.labels).map((label) => readString(asRecord(label).title)).filter(Boolean),
      projectId,
    },
  };
}

export async function indexGitlab(change: ChangeRequest, sha: string): Promise<IndexedFile[]> {
  const all = await paginateGitlab(
    `${workerConfig.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(change.repository.id)}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(sha)}`,
    workerConfig.indexMaxTreePages * 100,
    "GitLab tree failed",
    change.repository.id,
  );
  const entries = all
    .filter((item) => item.type === "blob" && typeof item.path === "string" && shouldIndexPath(item.path))
    .map((item) => ({ path: readString(item.path) }));
  const chosen = prioritizeIndexPaths(entries, change.files.map((file) => file.path), workerConfig.indexMaxFiles);
  const fetched = await mapLimit(chosen, workerConfig.indexFetchConcurrency, async (entry) => {
    try {
      const response = await fetchWithRetry(
        `${workerConfig.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(change.repository.id)}/repository/files/${encodeURIComponent(entry.path)}/raw?ref=${encodeURIComponent(sha)}`,
        { headers: gitlabHeaders(change.repository.id) },
      );
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > workerConfig.indexMaxFileChars) return null;
      return { path: entry.path, content: text, size: text.length } satisfies IndexedFile;
    } catch {
      return null;
    }
  });
  return fetched.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function publishGitlab(
  payload: Record<string, unknown>,
  analysisId: string,
  findings: Finding[],
  risk: { level: string; score: number },
): Promise<void> {
  const project = readString(asRecord(payload.project).id);
  const iid = readNumber(asRecord(payload.object_attributes).iid);
  const body = `${reviewSummary(findings, risk)}\n\n[Full analysis](${workerConfig.webUrl}/analyses/${analysisId})`;
  const response = await fetchWithRetry(
    `${workerConfig.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(project)}/merge_requests/${iid}/notes`,
    {
      method: "POST",
      headers: { ...gitlabHeaders(project), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) throw new Error(`GitLab publish failed ${response.status}`);
}

async function paginateGitlab(
  url: string,
  maxItems: number,
  errorPrefix = "GitLab request failed",
  projectId = "",
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let next = url;
  let page = 1;
  while (next && items.length < maxItems && page <= workerConfig.indexMaxTreePages) {
    const separator = next.includes("?") ? "&" : "?";
    const requestUrl = /[?&]page=/.test(next) ? next : `${next}${separator}page=${page}`;
    const response = await fetchWithRetry(requestUrl, { headers: gitlabHeaders(projectId) });
    if (!response.ok) {
      if (page === 1) throw new Error(`${errorPrefix} ${response.status}`);
      break;
    }
    const pageItems = asArray(await response.json()).map(asRecord);
    items.push(...pageItems);
    const nextPage = response.headers.get("x-next-page");
    if (pageItems.length === 0) break;
    if (nextPage) page = Number(nextPage);
    else if (pageItems.length >= 100) page += 1;
    else break;
    next = url;
  }
  return items.slice(0, maxItems);
}
