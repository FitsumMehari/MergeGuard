import crypto from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import rawBody from "fastify-raw-body";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { db } from "@mergeguard/db";
import { loadApiConfig } from "./config.js";
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
const redis = new IORedis(config.redisUrl, {
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
    if (!request.url.startsWith("/api/"))
        return;
    if (!config.dashboardApiKey && config.nodeEnv !== "production")
        return;
    const token = parseBearer(request.headers.authorization);
    if (!token || !safeEqual(token, config.dashboardApiKey ?? "")) {
        return reply.code(401).send({ error: "unauthorized" });
    }
});
app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return payload;
});
app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    if (!reply.sent)
        reply.code(500).send({ error: "internal_error" });
});
app.get("/health/live", async () => ({ ok: true, service: "mergeguard-api" }));
app.get("/health/ready", async (_request, reply) => {
    try {
        await Promise.all([db.$queryRaw `SELECT 1`, redis.ping()]);
        return { ok: true, database: "ok", redis: "ok" };
    }
    catch (error) {
        app.log.warn({ err: error }, "readiness check failed");
        return reply.code(503).send({ ok: false });
    }
});
app.post("/webhooks/github", { config: { rawBody: true } }, async (request, reply) => {
    const body = String((request as FastifyRequest & {
        rawBody?: string;
    }).rawBody ?? "");
    const signature = String(request.headers["x-hub-signature-256"] ?? "");
    if (!config.githubWebhookSecret)
        return reply.code(503).send({ error: "github_integration_not_configured" });
    if (!verifyGithub(body, signature, config.githubWebhookSecret)) {
        return reply.code(401).send({ error: "bad_signature" });
    }
    const event = String(request.headers["x-github-event"] ?? "");
    const deliveryId = String(request.headers["x-github-delivery"] ?? crypto.randomUUID());
    const payload = request.body as Record<string, any>;
    const action = String(payload?.action ?? "");
    if (event === "pull_request" && ["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) {
        await enqueueOnce("github", deliveryId, event, payload, githubAnalysisKey(payload));
    }
    return { ok: true };
});
app.post("/webhooks/gitlab", async (request, reply) => {
    const token = String(request.headers["x-gitlab-token"] ?? "");
    if (!config.gitlabWebhookSecret)
        return reply.code(503).send({ error: "gitlab_integration_not_configured" });
    if (!safeEqual(token, config.gitlabWebhookSecret)) {
        return reply.code(401).send({ error: "bad_token" });
    }
    const event = String(request.headers["x-gitlab-event"] ?? "");
    const payload = request.body as Record<string, any>;
    const deliveryId = String(request.headers["x-gitlab-webhook-uuid"] ??
        crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"));
    const action = String(payload?.object_attributes?.action ?? "");
    if ((event === "Merge Request Hook" || payload?.object_kind === "merge_request") && ["open", "reopen", "update"].includes(action)) {
        await enqueueOnce("gitlab", deliveryId, event, payload, gitlabAnalysisKey(payload));
    }
    return { ok: true };
});
app.get("/api/analyses", async () => db.analysisRun.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
        changeRequest: { include: { repository: true } },
        _count: { select: { findings: true } },
    },
}));
app.get("/api/repositories/:id/index", async (request, reply) => {
    const { id } = request.params as {
        id: string;
    };
    const index = await db.repositoryIndex.findFirst({
        where: { repositoryId: id },
        orderBy: { generatedAt: "desc" },
    });
    if (!index)
        return reply.code(404).send({ error: "repository_index_not_found" });
    return { sha: index.sha, fileCount: index.fileCount, generatedAt: index.generatedAt, model: index.model };
});
app.get("/api/analyses/:id", async (request, reply) => {
    const { id } = request.params as {
        id: string;
    };
    const analysis = await db.analysisRun.findUnique({
        where: { id },
        include: {
            changeRequest: { include: { repository: true } },
            findings: { orderBy: { confidence: "desc" } },
            signals: true,
        },
    });
    if (!analysis)
        return reply.code(404).send({ error: "analysis_not_found" });
    return analysis;
});
app.post("/api/findings/:id/feedback", async (request, reply) => {
    const { id } = request.params as {
        id: string;
    };
    const feedback = (request.body as {
        feedback?: string;
    } | undefined)?.feedback;
    if (!feedback || !["correct", "false_positive", "not_relevant"].includes(feedback)) {
        return reply.code(400).send({ error: "invalid_feedback" });
    }
    return db.finding.update({ where: { id }, data: { feedback } });
});
async function enqueueOnce(platform: "github" | "gitlab", deliveryId: string, event: string, payload: unknown, analysisKey: string): Promise<void> {
    const jobId = `${platform}:${analysisKey}`;
    try {
        await queue.add("analyze", { platform, deliveryId, payload }, { jobId });
    }
    catch (error) {
        // BullMQ rejects duplicate job IDs while the retained job exists. Treat only that case as idempotent.
        if (!isDuplicateJobError(error))
            throw error;
    }
    try {
        await db.webhookDelivery.create({ data: { platform, deliveryId, event } });
    }
    catch (error) {
        if (!isUniqueConstraintError(error))
            throw error;
    }
}
function githubAnalysisKey(payload: Record<string, any>): string {
    const repo = String(payload?.repository?.id ?? "unknown-repo");
    const number = String(payload?.pull_request?.number ?? "unknown-pr");
    const sha = String(payload?.pull_request?.head?.sha ?? payload?.after ?? "unknown-sha");
    return `${repo}:${number}:${sha}`;
}
function gitlabAnalysisKey(payload: Record<string, any>): string {
    const project = String(payload?.project?.id ?? "unknown-project");
    const iid = String(payload?.object_attributes?.iid ?? "unknown-mr");
    const sha = String(payload?.object_attributes?.last_commit?.id ?? payload?.object_attributes?.last_commit?.sha ?? "unknown-sha");
    return `${project}:${iid}:${sha}`;
}
function verifyGithub(body: string, signature: string, secret: string): boolean {
    if (!signature.startsWith("sha256="))
        return false;
    const digest = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    return safeEqual(digest, signature);
}
function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function parseBearer(header?: string): string | undefined {
    if (!header?.startsWith("Bearer "))
        return undefined;
    return header.slice(7).trim() || undefined;
}
function isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && (error as {
        code?: string;
    }).code === "P2002";
}
function isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /job.*already exists|jobid.*exists|duplicate/i.test(message);
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
}
catch (error) {
    app.log.fatal({ err: error }, "failed to start API");
    await shutdown("startup_error");
    process.exit(1);
}

