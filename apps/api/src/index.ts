import crypto from "node:crypto";
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from "fastify";
import rawBody from "fastify-raw-body";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { db } from "@mergeguard/db";
import { loadApiConfig } from "./config.js";
import {
  asRecord,
  githubAnalysisKey,
  gitlabAnalysisKey,
  isDuplicateJobError,
  isPrismaUniqueConstraint,
  parseBearer,
  readString,
  timingSafeEqualString,
  verifyGithubSignature,
} from "./security.js";

const config = loadApiConfig();
const app = Fastify({
  logger: true,
  bodyLimit: config.bodyLimitBytes,
  trustProxy: true,
});

await app.register(rawBody, {
  field: "rawBody",
  global: true,
  encoding: "utf8",
  runFirst: true,
});

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const queue = new Queue("mergeguard-analysis", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 2000,
  },
});

app.addHook("onRequest", async (request, reply) => {
  if (!request.url.startsWith("/api/")) return;
  if (!config.dashboardApiKey && config.nodeEnv !== "production") return;
  const token = parseBearer(request.headers.authorization);
  if (!token || !timingSafeEqualString(token, config.dashboardApiKey ?? "")) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Cache-Control", "no-store");
  return payload;
});

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error({ err: error }, "request failed");
  if (reply.sent) return;
  const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
  reply.code(status).send({ error: status >= 500 ? "internal_error" : error.message });
});

app.get("/health/live", async () => ({ ok: true, service: "mergeguard-api" }));

app.get("/health/ready", async (_request, reply) => {
  try {
    await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);
    return { ok: true, database: "ok", redis: "ok" };
  } catch (error) {
    app.log.warn({ err: error }, "readiness check failed");
    return reply.code(503).send({ ok: false });
  }
});

app.post("/webhooks/github", { config: { rawBody: true } }, async (request, reply) => {
  const body = String((request as FastifyRequest & { rawBody?: string }).rawBody ?? "");
  const signature = String(request.headers["x-hub-signature-256"] ?? "");
  if (!config.githubWebhookSecret) return reply.code(503).send({ error: "github_integration_not_configured" });
  if (!verifyGithubSignature(body, signature, config.githubWebhookSecret)) {
    return reply.code(401).send({ error: "bad_signature" });
  }
  const event = String(request.headers["x-github-event"] ?? "");
  const deliveryId = String(request.headers["x-github-delivery"] ?? crypto.randomUUID());
  const payload = asRecord(request.body);
  const action = readString(payload.action);
  if (event === "pull_request" && ["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) {
    await enqueueOnce("github", deliveryId, event, payload, githubAnalysisKey(payload));
  }
  return { ok: true };
});

app.post("/webhooks/gitlab", async (request, reply) => {
  const token = String(request.headers["x-gitlab-token"] ?? "");
  if (!config.gitlabWebhookSecret) return reply.code(503).send({ error: "gitlab_integration_not_configured" });
  if (!timingSafeEqualString(token, config.gitlabWebhookSecret)) {
    return reply.code(401).send({ error: "bad_token" });
  }
  const event = String(request.headers["x-gitlab-event"] ?? "");
  const payload = asRecord(request.body);
  const deliveryId = String(
    request.headers["x-gitlab-webhook-uuid"] ?? crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  );
  const action = readString(asRecord(payload.object_attributes).action).toLowerCase();
  const mrEvent = event === "Merge Request Hook" || payload.object_kind === "merge_request";
  if (mrEvent && ["open", "opened", "reopen", "reopened", "update", "ready"].includes(action)) {
    await enqueueOnce("gitlab", deliveryId, event || "merge_request", payload, gitlabAnalysisKey(payload));
  }
  return { ok: true };
});

app.get("/api/analyses", async (request) => {
  const query = request.query as { take?: string };
  const take = Math.min(100, Math.max(1, Number(query.take) || 50));
  return db.analysisRun.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      changeRequest: { include: { repository: true } },
      _count: { select: { findings: true } },
    },
  });
});

app.get("/api/repositories/:id/index", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const index = await db.repositoryIndex.findFirst({
    where: { repositoryId: request.params.id },
    orderBy: { generatedAt: "desc" },
  });
  if (!index) return reply.code(404).send({ error: "repository_index_not_found" });
  return { sha: index.sha, fileCount: index.fileCount, generatedAt: index.generatedAt, model: index.model };
});

app.get("/api/analyses/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const analysis = await db.analysisRun.findUnique({
    where: { id: request.params.id },
    include: {
      changeRequest: { include: { repository: true } },
      findings: { orderBy: { confidence: "desc" } },
      signals: true,
    },
  });
  if (!analysis) return reply.code(404).send({ error: "analysis_not_found" });
  return analysis;
});

app.post("/api/findings/:id/feedback", async (request: FastifyRequest<{ Params: { id: string }; Body: { feedback?: string } }>, reply: FastifyReply) => {
  const feedback = request.body?.feedback;
  if (!feedback || !["correct", "false_positive", "not_relevant"].includes(feedback)) {
    return reply.code(400).send({ error: "invalid_feedback" });
  }
  try {
    return await db.finding.update({ where: { id: request.params.id }, data: { feedback } });
  } catch {
    return reply.code(404).send({ error: "finding_not_found" });
  }
});

async function enqueueOnce(
  platform: "github" | "gitlab",
  deliveryId: string,
  event: string,
  payload: unknown,
  analysisKey: string,
): Promise<void> {
  const jobId = `${platform}:${analysisKey}`;
  try {
    await queue.add("analyze", { platform, deliveryId, payload }, { jobId });
  } catch (error) {
    if (!isDuplicateJobError(error)) throw error;
  }
  try {
    await db.webhookDelivery.create({ data: { platform, deliveryId, event } });
  } catch (error) {
    if (!isPrismaUniqueConstraint(error)) throw error;
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await queue.close();
  await redis.quit();
  await db.$disconnect();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (error) {
  app.log.fatal({ err: error }, "failed to start API");
  await shutdown("startup_error");
  process.exit(1);
}
