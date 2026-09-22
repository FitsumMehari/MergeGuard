import { Worker } from "bullmq";
import IORedis from "ioredis";
import { SignJWT, importPKCS8 } from "jose";
import { db } from "@mergeguard/db";
import { analyzeStatic, detectCandidates, buildJevState } from "@mergeguard/analyzer";
import { verifyCandidates } from "@mergeguard/providers";
import { riskFromFindings, type ChangeRequest, type ChangedFile, type Finding } from "@mergeguard/core";
import { applyChangedFiles, buildRepositoryModel, projectAwareCandidates, relevantContext, shouldIndexPath, summarizeRepoModel, type IndexedFile, type RepoModel } from "@mergeguard/repo-intel";
import { workerConfig } from "./config.js";
import { fetchWithRetry } from "./http.js";
const connection = new IORedis(workerConfig.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
const worker = new Worker("mergeguard-analysis", async (job) => {
    const { platform, payload } = job.data as {
        platform: "github" | "gitlab";
        payload: any;
    };
    let normalized: ChangeRequest;
    let publish: (analysisId: string, findings: Finding[], risk: any) => Promise<void>;
    if (platform === "github") {
        const token = await githubInstallationToken(payload.installation.id);
        normalized = await normalizeGithub(payload, token);
        publish = (id, findings, risk) => publishGithub(payload, token, id, findings, risk);
    }
    else {
        normalized = await normalizeGitlab(payload);
        publish = (id, findings, risk) => publishGitlab(payload, id, findings, risk);
    }
    const repo = await db.repository.upsert({ where: { platform_externalId: { platform, externalId: normalized.repository.id } }, create: { platform, externalId: normalized.repository.id, owner: normalized.repository.owner, name: normalized.repository.name, url: normalized.repository.url }, update: { owner: normalized.repository.owner, name: normalized.repository.name, url: normalized.repository.url } });
    const cr = await db.changeRequest.upsert({ where: { repositoryId_externalId: { repositoryId: repo.id, externalId: normalized.change.id } }, create: { repositoryId: repo.id, externalId: normalized.change.id, number: normalized.change.number, title: normalized.change.title, author: normalized.change.author.username, baseSha: normalized.change.baseSha, headSha: normalized.change.headSha, url: normalized.change.url }, update: { title: normalized.change.title, baseSha: normalized.change.baseSha, headSha: normalized.change.headSha, url: normalized.change.url } });
    const run = await db.analysisRun.upsert({
        where: { changeRequestId_headSha: { changeRequestId: cr.id, headSha: normalized.change.headSha } },
        create: { changeRequestId: cr.id, headSha: normalized.change.headSha, status: "running", filesReviewed: normalized.files.length },
        update: { status: "running", filesReviewed: normalized.files.length, error: null, completedAt: null },
    });
    await db.$transaction([
        db.finding.deleteMany({ where: { analysisRunId: run.id } }),
        db.staticSignalRecord.deleteMany({ where: { analysisRunId: run.id } }),
    ]);
    try {
        const baseRepoModel = await getRepositoryModel(repo.id, normalized, platform, payload);
        const repoModel = applyChangedFiles(baseRepoModel, normalized.files);
        const signals = analyzeStatic(normalized);
        const candidates = [...detectCandidates(normalized), ...projectAwareCandidates(repoModel, normalized.files)];
        const related = relevantContext(repoModel, normalized.files.map(f => f.path), workerConfig.maxRelatedFiles);
        const repoSummary = summarizeRepoModel(repoModel);
        const findings = await verifyCandidates(candidates, signals, normalized.change.title, (candidate) => ({
            ...buildJevState(normalized, candidate, signals),
            repository: repoSummary,
            relatedPaths: related,
            projectInstruction: "Use the repository model as context. A candidate should be suppressed when repository-level guards, constraints, infrastructure, or architecture clearly neutralize it."
        }));
        const min = workerConfig.reportConfidenceThreshold;
        const reportable = findings.filter(f => f.confidence >= min);
        const risk = riskFromFindings(reportable, signals);
        await db.$transaction([
            db.analysisRun.update({ where: { id: run.id }, data: { status: "completed", riskLevel: risk.level, riskScore: risk.score, riskConfidence: risk.confidence, relatedFilesReviewed: related.length, completedAt: new Date() } }),
            ...signals.map(s => db.staticSignalRecord.create({ data: { id: `${run.id}_${s.id}`, analysisRunId: run.id, category: s.category, severity: s.severity, file: s.file, line: s.line, title: s.title, description: s.description, confidence: s.confidence, evidence: s.evidence as any } })),
            ...reportable.map(f => db.finding.create({ data: { id: `${run.id}_${f.id}`, analysisRunId: run.id, category: f.category, severity: f.severity, confidence: f.confidence, title: f.title, description: f.description, file: f.file, startLine: f.startLine, endLine: f.endLine, evidence: f.evidence as any, executionPath: f.executionPath as any, edgeCase: f.edgeCase as any, remediation: f.remediation, suggestedTest: f.suggestedTest, verification: f.verification as any, source: f.source } }))
        ]);
        await publish(run.id, reportable, risk);
        return { analysisId: run.id, risk, findings: reportable.length };
    }
    catch (e: any) {
        await db.analysisRun.update({ where: { id: run.id }, data: { status: "failed", error: String(e?.stack || e).slice(0, 10000), completedAt: new Date() } });
        throw e;
    }
}, { connection, concurrency: workerConfig.concurrency });
async function getRepositoryModel(repositoryId: string, cr: ChangeRequest, platform: "github" | "gitlab", payload: any): Promise<RepoModel> {
    const sha = cr.change.baseSha;
    const cached = await db.repositoryIndex.findUnique({ where: { repositoryId_sha: { repositoryId, sha } } });
    if (cached)
        return cached.model as unknown as RepoModel;
    let files: IndexedFile[] = [];
    if (platform === "github") {
        const token = await githubInstallationToken(payload.installation.id);
        files = await indexGithub(cr, token, sha);
    }
    else
        files = await indexGitlab(cr, sha);
    const model = buildRepositoryModel(files, sha);
    await db.repositoryIndex.upsert({ where: { repositoryId_sha: { repositoryId, sha } }, create: { repositoryId, sha, model: model as any, fileCount: files.length }, update: { model: model as any, fileCount: files.length, generatedAt: new Date() } });
    return model;
}
async function indexGithub(cr: ChangeRequest, token: string, sha: string): Promise<IndexedFile[]> {
    const tree = await gh(`/repos/${cr.repository.owner}/${cr.repository.name}/git/trees/${sha}?recursive=1`, token);
    const entries = (tree.tree || []).filter((x: any) => x.type === "blob" && x.path && shouldIndexPath(x.path) && Number(x.size || 0) <= workerConfig.indexMaxFileBytes);
    const chosen = prioritizeIndexEntries(entries, cr.files.map(f => f.path));
    return mapLimit(chosen, workerConfig.indexFetchConcurrency, async (e: any) => { try {
        const b = await gh(`/repos/${cr.repository.owner}/${cr.repository.name}/git/blobs/${e.sha}`, token);
        if (b.encoding !== "base64")
            return null;
        return { path: e.path, content: Buffer.from(b.content, "base64").toString("utf8").slice(0, workerConfig.indexMaxFileChars), size: e.size } as IndexedFile;
    }
    catch {
        return null;
    } }).then(xs => xs.filter(Boolean) as IndexedFile[]);
}
async function indexGitlab(cr: ChangeRequest, sha: string): Promise<IndexedFile[]> {
    const base = workerConfig.gitlabBaseUrl, token = workerConfig.gitlabToken;
    if (!token)
        throw new Error("Missing GITLAB_TOKEN");
    const all: any[] = [];
    for (let page = 1; page <= workerConfig.indexMaxTreePages; page++) {
        const r = await fetchWithRetry(`${base}/api/v4/projects/${encodeURIComponent(cr.repository.id)}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(sha)}`, { headers: { "PRIVATE-TOKEN": token } });
        if (!r.ok)
            break;
        const xs: any[] = await r.json();
        all.push(...xs);
        if (xs.length < 100)
            break;
    }
    const entries = all.filter(x => x.type === "blob" && shouldIndexPath(x.path));
    const chosen = prioritizeIndexEntries(entries, cr.files.map(f => f.path));
    return mapLimit(chosen, workerConfig.indexFetchConcurrency, async (e: any) => { try {
        const r = await fetchWithRetry(`${base}/api/v4/projects/${encodeURIComponent(cr.repository.id)}/repository/files/${encodeURIComponent(e.path)}/raw?ref=${encodeURIComponent(sha)}`, { headers: { "PRIVATE-TOKEN": token } });
        if (!r.ok)
            return null;
        const text = await r.text();
        if (text.length > workerConfig.indexMaxFileChars)
            return null;
        return { path: e.path, content: text, size: text.length } as IndexedFile;
    }
    catch {
        return null;
    } }).then(xs => xs.filter(Boolean) as IndexedFile[]);
}
function prioritizeIndexEntries(entries: any[], changed: string[]) {
    const changedRoots = new Set(changed.map(p => p.split("/").slice(0, 2).join("/")));
    const score = (p: string) => /package\.json$|pnpm-workspace|nx\.json$|turbo\.json$|tsconfig|schema\.prisma$|Dockerfile|docker-compose|compose\.ya?ml$|nginx|\.conf$/i.test(p) ? 1000 : changedRoots.has(p.split("/").slice(0, 2).join("/")) ? 500 : /src\//.test(p) ? 120 : 50;
    return [...entries].sort((a, b) => score(b.path) - score(a.path) || String(a.path).localeCompare(String(b.path))).slice(0, workerConfig.indexMaxFiles);
}
async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> { const out = new Array<R>(xs.length); let next = 0; async function worker() { for (;;) {
    const i = next++;
    if (i >= xs.length)
        return;
    out[i] = await fn(xs[i]);
} } await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, xs.length)) }, worker)); return out; }
async function githubInstallationToken(installationId: number) {
    const appId = workerConfig.githubAppId, raw = workerConfig.githubPrivateKey;
    if (!appId || !raw)
        throw new Error("Missing GitHub App credentials");
    const pem = raw.replace(/\\n/g, "\n");
    const key = await importPKCS8(pem, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({}).setProtectedHeader({ alg: "RS256" }).setIssuer(appId).setIssuedAt(now - 30).setExpirationTime(now + 540).sign(key);
    const r = await fetchWithRetry(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: "POST", headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
    if (!r.ok)
        throw new Error(`GitHub installation token failed ${r.status}`);
    return (await r.json() as any).token as string;
}
async function gh(path: string, token: string, init: RequestInit = {}) { const r = await fetchWithRetry(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers || {}) } }); if (!r.ok)
    throw new Error(`GitHub ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`); return r.json() as Promise<any>; }
async function normalizeGithub(p: any, token: string): Promise<ChangeRequest> {
    const pr = p.pull_request, repo = p.repository, owner = repo.owner.login, name = repo.name;
    const raw = await gh(`/repos/${owner}/${name}/pulls/${pr.number}/files?per_page=100`, token);
    const files: ChangedFile[] = [];
    for (const f of raw.slice(0, workerConfig.maxChangedFiles)) {
        let headContent = "";
        if (f.status !== "removed" && /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|prisma|yml|yaml)$/.test(f.filename)) {
            try {
                const c = await gh(`/repos/${owner}/${name}/contents/${encodePath(f.filename)}?ref=${pr.head.sha}`, token);
                if (c.encoding === "base64")
                    headContent = Buffer.from(c.content, "base64").toString("utf8").slice(0, workerConfig.maxFileContentChars);
            }
            catch { }
        }
        files.push({ path: f.filename, previousPath: f.previous_filename, status: f.status === "removed" ? "deleted" : f.status === "renamed" ? "renamed" : f.status === "added" ? "added" : "modified", additions: f.additions, deletions: f.deletions, patch: f.patch, headContent });
    }
    return { platform: "github", repository: { id: String(repo.id), owner, name, defaultBranch: repo.default_branch, url: repo.html_url }, change: { id: String(pr.id), number: pr.number, title: pr.title, description: pr.body || "", baseSha: pr.base.sha, headSha: pr.head.sha, author: { id: String(pr.user.id), username: pr.user.login }, url: pr.html_url }, files, metadata: { draft: !!pr.draft, labels: (pr.labels || []).map((x: any) => x.name), installationId: String(p.installation.id) } };
}
function encodePath(path: string) { return path.split("/").map(encodeURIComponent).join("/"); }
async function normalizeGitlab(p: any): Promise<ChangeRequest> {
    const base = workerConfig.gitlabBaseUrl, token = workerConfig.gitlabToken;
    if (!token)
        throw new Error("Missing GITLAB_TOKEN");
    const project = p.project, mr = p.object_attributes, projectId = project.id;
    const r = await fetchWithRetry(`${base}/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests/${mr.iid}/diffs?per_page=100`, { headers: { "PRIVATE-TOKEN": token } });
    if (!r.ok)
        throw new Error(`GitLab diffs failed ${r.status}`);
    const raw: any[] = await r.json();
    const files: ChangedFile[] = raw.slice(0, workerConfig.maxChangedFiles).map(f => ({ path: f.new_path, previousPath: f.old_path, status: f.deleted_file ? "deleted" : f.renamed_file ? "renamed" : f.new_file ? "added" : "modified", patch: f.diff }));
    for (const f of files) {
        if (f.status !== "deleted" && /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|prisma|yml|yaml)$/.test(f.path)) {
            try {
                const rr = await fetchWithRetry(`${base}/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(f.path)}/raw?ref=${encodeURIComponent(mr.last_commit.id)}`, { headers: { "PRIVATE-TOKEN": token } });
                if (rr.ok)
                    f.headContent = (await rr.text()).slice(0, workerConfig.maxFileContentChars);
            }
            catch { }
        }
    }
    const namespace = (project.path_with_namespace || project.name).split("/");
    return { platform: "gitlab", repository: { id: String(projectId), owner: namespace.slice(0, -1).join("/"), name: namespace.at(-1)!, defaultBranch: project.default_branch, url: project.web_url }, change: { id: String(mr.id), number: mr.iid, title: mr.title, description: mr.description || "", baseSha: mr.target?.last_commit?.id || mr.oldrev || "unknown", headSha: mr.last_commit.id, author: { id: String(p.user.id), username: p.user.username }, url: mr.url }, files, metadata: { draft: !!mr.draft, labels: (p.labels || []).map((x: any) => x.title), projectId: String(projectId) } };
}
function summary(findings: Finding[], risk: any) { const top = findings.slice(0, 10); return `## MergeGuard review\n\n**Overall risk: ${String(risk.level).toUpperCase()} (${risk.score}/100)**\n\n${top.length ? top.map(f => `- **${f.severity.toUpperCase()} · ${f.category} · ${Math.round(f.confidence * 100)}%** — ${f.title} (${f.file}${f.startLine ? `:${f.startLine}` : ""})`).join("\n") : "No reportable high-confidence issues found."}\n\n> MergeGuard reports potential issues, not proofs. Validate findings in repository context.`; }
async function publishGithub(p: any, token: string, analysisId: string, findings: Finding[], risk: any) {
    const owner = p.repository.owner.login, name = p.repository.name, sha = p.pull_request.head.sha;
    const annotations = findings.filter(f => f.startLine).slice(0, 20).map(f => ({ path: f.file, start_line: f.startLine, end_line: f.endLine || f.startLine, annotation_level: f.severity === "critical" || f.severity === "high" ? "failure" : f.severity === "medium" ? "warning" : "notice", title: f.title, message: `${f.description}\n\nConfidence: ${Math.round(f.confidence * 100)}%${f.remediation ? `\n\nSuggested fix: ${f.remediation}` : ""}`.slice(0, 65000) }));
    await gh(`/repos/${owner}/${name}/check-runs`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "MergeGuard", head_sha: sha, status: "completed", conclusion: findings.some(f => f.severity === "critical" && f.confidence >= .9) ? "failure" : "neutral", output: { title: `MergeGuard: ${String(risk.level).toUpperCase()} risk`, summary: summary(findings, risk), annotations }, details_url: `${workerConfig.webUrl}/analyses/${analysisId}` }) });
}
async function publishGitlab(p: any, analysisId: string, findings: Finding[], risk: any) { const base = workerConfig.gitlabBaseUrl, token = workerConfig.gitlabToken!; const project = p.project.id, iid = p.object_attributes.iid; const body = summary(findings, risk) + `\n\n[Full analysis](${workerConfig.webUrl}/analyses/${analysisId})`; const r = await fetchWithRetry(`${base}/api/v4/projects/${encodeURIComponent(project)}/merge_requests/${iid}/notes`, { method: "POST", headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" }, body: JSON.stringify({ body }) }); if (!r.ok)
    throw new Error(`GitLab publish failed ${r.status}`); }
worker.on("completed", job => console.info(JSON.stringify({ level: "info", event: "job_completed", jobId: job.id })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ level: "error", event: "job_failed", jobId: job?.id, error: error.message })));
worker.on("error", error => console.error(JSON.stringify({ level: "error", event: "worker_error", error: error.message })));
async function shutdown(signal: string): Promise<void> {
    console.info(JSON.stringify({ level: "info", event: "worker_shutdown", signal }));
    await worker.close();
    await connection.quit();
    await db.$disconnect();
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
        void shutdown(signal).finally(() => process.exit(0));
    });
}
console.info(JSON.stringify({ level: "info", event: "worker_started", concurrency: workerConfig.concurrency }));

