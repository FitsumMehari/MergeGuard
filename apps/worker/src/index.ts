import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { db, Prisma } from "@mergeguard/db";
import { analyzeStatic, detectCandidates, buildJevState } from "@mergeguard/analyzer";
import { verifyCandidates } from "@mergeguard/providers";
import { riskFromFindings, type ChangeRequest, type Finding } from "@mergeguard/core";
import { applyChangedFiles, buildRepositoryModel, emptyRepositoryModel, projectAwareCandidates, relevantContext, summarizeRepoModel, type RepoModel } from "@mergeguard/repo-intel";
import { workerConfig } from "./config.js";
import { githubInstallationToken, indexGithub, normalizeGithub, publishGithub } from "./github.js";
import { indexGitlab, normalizeGitlab, publishGitlab } from "./gitlab.js";
import { asRecord, logJson, publicErrorMessage, readNumber } from "./util.js";

const connection = new Redis(workerConfig.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });

const worker = new Worker(
  "mergeguard-analysis",
  async (job) => {
    const data = asRecord(job.data);
    const platform = data.platform === "gitlab" ? "gitlab" : "github";
    const payload = asRecord(data.payload);
    const change = platform === "github" ? await loadGithubChange(payload) : await normalizeGitlab(payload);
    logJson("info", "analysis_started", {
      platform,
      repository: `${change.repository.owner}/${change.repository.name}`,
      change: change.change.number,
      headSha: change.change.headSha,
      files: change.files.length,
    });
    return runAnalysis(platform, payload, change);
  },
  { connection, concurrency: workerConfig.concurrency },
);

async function loadGithubChange(payload: Record<string, unknown>): Promise<ChangeRequest> {
  const installationId = readNumber(asRecord(payload.installation).id);
  if (!installationId) throw new Error("GitHub payload missing installation id");
  const token = await githubInstallationToken(installationId);
  return normalizeGithub(payload, token);
}

async function runAnalysis(platform: "github" | "gitlab", payload: Record<string, unknown>, normalized: ChangeRequest) {
  const repo = await db.repository.upsert({
    where: { platform_externalId: { platform, externalId: normalized.repository.id } },
    create: {
      platform,
      externalId: normalized.repository.id,
      owner: normalized.repository.owner,
      name: normalized.repository.name,
      url: normalized.repository.url,
    },
    update: { owner: normalized.repository.owner, name: normalized.repository.name, url: normalized.repository.url },
  });
  const changeRequest = await db.changeRequest.upsert({
    where: { repositoryId_externalId: { repositoryId: repo.id, externalId: normalized.change.id } },
    create: {
      repositoryId: repo.id,
      externalId: normalized.change.id,
      number: normalized.change.number,
      title: normalized.change.title,
      author: normalized.change.author.username,
      baseSha: normalized.change.baseSha,
      headSha: normalized.change.headSha,
      url: normalized.change.url,
    },
    update: { title: normalized.change.title, baseSha: normalized.change.baseSha, headSha: normalized.change.headSha, url: normalized.change.url },
  });
  const run = await db.analysisRun.upsert({
    where: { changeRequestId_headSha: { changeRequestId: changeRequest.id, headSha: normalized.change.headSha } },
    create: { changeRequestId: changeRequest.id, headSha: normalized.change.headSha, status: "running", filesReviewed: normalized.files.length },
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
    const related = relevantContext(repoModel, normalized.files.map((file) => file.path), workerConfig.maxRelatedFiles);
    const repoSummary = summarizeRepoModel(repoModel);
    const findings = await verifyCandidates(candidates, signals, normalized.change.title, (candidate) => ({
      ...buildJevState(normalized, candidate, signals),
      repository: repoSummary,
      relatedPaths: related,
      projectInstruction:
        "Use the repository model as context. A candidate should be suppressed when repository-level guards, constraints, infrastructure, or architecture clearly neutralize it.",
    }));
    const reportable = findings.filter((finding) => finding.confidence >= workerConfig.reportConfidenceThreshold);
    const risk = riskFromFindings(reportable, signals);

    await db.$transaction(async (tx) => {
      await tx.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          riskLevel: risk.level,
          riskScore: risk.score,
          riskConfidence: risk.confidence,
          relatedFilesReviewed: related.length,
          completedAt: new Date(),
        },
      });
      if (signals.length) {
        await tx.staticSignalRecord.createMany({
          data: signals.map((signal) => ({
            id: `${run.id}_${signal.id}`,
            analysisRunId: run.id,
            category: signal.category,
            severity: signal.severity,
            file: signal.file,
            line: signal.line,
            title: signal.title,
            description: signal.description,
            confidence: signal.confidence,
            evidence: (signal.evidence ?? []) as Prisma.InputJsonValue,
          })),
        });
      }
      if (reportable.length) {
        await tx.finding.createMany({
          data: reportable.map((finding) => ({
            id: `${run.id}_${finding.id}`,
            analysisRunId: run.id,
            category: finding.category,
            severity: finding.severity,
            confidence: finding.confidence,
            title: finding.title,
            description: finding.description,
            file: finding.file,
            startLine: finding.startLine,
            endLine: finding.endLine,
            evidence: finding.evidence as Prisma.InputJsonValue,
            executionPath: finding.executionPath ? (finding.executionPath as Prisma.InputJsonValue) : undefined,
            edgeCase: finding.edgeCase ? (finding.edgeCase as Prisma.InputJsonValue) : undefined,
            remediation: finding.remediation,
            suggestedTest: finding.suggestedTest,
            verification: finding.verification as unknown as Prisma.InputJsonValue,
            source: finding.source,
          })),
        });
      }
    });

    await publishResults(platform, payload, run.id, reportable, risk);
    return { analysisId: run.id, risk, findings: reportable.length };
  } catch (error) {
    await db.analysisRun.update({
      where: { id: run.id },
      data: { status: "failed", error: publicErrorMessage(error), completedAt: new Date() },
    });
    throw error;
  }
}

async function getRepositoryModel(
  repositoryId: string,
  change: ChangeRequest,
  platform: "github" | "gitlab",
  payload: Record<string, unknown>,
): Promise<RepoModel> {
  const sha = change.change.baseSha;
  const cached = await db.repositoryIndex.findUnique({ where: { repositoryId_sha: { repositoryId, sha } } });
  if (cached) return cached.model as unknown as RepoModel;
  try {
    const files =
      platform === "github"
        ? await indexGithub(change, await githubInstallationToken(readNumber(asRecord(payload.installation).id)), sha)
        : await indexGitlab(change, sha);
    const model = files.length ? buildRepositoryModel(files, sha) : emptyRepositoryModel(sha);
    await db.repositoryIndex.upsert({
      where: { repositoryId_sha: { repositoryId, sha } },
      create: { repositoryId, sha, model: model as unknown as Prisma.InputJsonValue, fileCount: files.length },
      update: { model: model as unknown as Prisma.InputJsonValue, fileCount: files.length, generatedAt: new Date() },
    });
    return model;
  } catch (error) {
    logJson("error", "repository_index_failed", {
      repositoryId,
      sha,
      error: publicErrorMessage(error).slice(0, 400),
    });
    return applyChangedFiles(emptyRepositoryModel(sha), change.files);
  }
}

async function publishResults(
  platform: "github" | "gitlab",
  payload: Record<string, unknown>,
  analysisId: string,
  findings: Finding[],
  risk: { level: string; score: number },
): Promise<void> {
  if (platform === "github") {
    const token = await githubInstallationToken(readNumber(asRecord(payload.installation).id));
    await publishGithub(payload, token, analysisId, findings, risk);
    return;
  }
  await publishGitlab(payload, analysisId, findings, risk);
}

worker.on("completed", (job) => logJson("info", "job_completed", { jobId: job.id }));
worker.on("failed", (job, error) => logJson("error", "job_failed", { jobId: job?.id, error: error.message }));
worker.on("error", (error) => logJson("error", "worker_error", { error: error.message }));

async function shutdown(signal: string): Promise<void> {
  logJson("info", "worker_shutdown", { signal });
  await worker.close();
  await connection.quit();
  await db.$disconnect();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

logJson("info", "worker_started", { concurrency: workerConfig.concurrency });
