function stringEnv(name: string, fallback?: string): string {
    const value = process.env[name]?.trim();
    if (value)
        return value;
    if (fallback !== undefined)
        return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
}
function intEnv(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
    const raw = process.env[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}
function boolEnv(name: string, fallback: boolean): boolean {
    const raw = process.env[name]?.trim().toLowerCase();
    if (raw === undefined || raw === "")
        return fallback;
    if (["1", "true", "yes", "on"].includes(raw))
        return true;
    if (["0", "false", "no", "off"].includes(raw))
        return false;
    throw new Error(`${name} must be a boolean`);
}
function floatEnv(name: string, fallback: number, min = 0, max = 1): number {
    const raw = process.env[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${name} must be a number between ${min} and ${max}`);
    }
    return value;
}
const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const requireJev = boolEnv("REQUIRE_JEV", nodeEnv === "production");
if (requireJev && !process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error("TYPESAFE_API_KEY is required when REQUIRE_JEV=true");
}
export const workerConfig = {
    nodeEnv,
    requireJev,
    redisUrl: stringEnv("REDIS_URL", "redis://localhost:6379"),
    concurrency: intEnv("WORKER_CONCURRENCY", 3, 1, 32),
    reportConfidenceThreshold: floatEnv("REPORT_CONFIDENCE_THRESHOLD", 0.72),
    maxRelatedFiles: intEnv("MAX_RELATED_FILES", 30, 1, 200),
    maxChangedFiles: intEnv("MAX_CHANGED_FILES", 80, 1, 500),
    maxFileContentChars: intEnv("MAX_FILE_CONTENT_CHARS", 48000, 1000, 500000),
    indexMaxFiles: intEnv("INDEX_MAX_FILES", 260, 10, 5000),
    indexMaxFileBytes: intEnv("INDEX_MAX_FILE_BYTES", 90000, 1000, 5000000),
    indexMaxFileChars: intEnv("INDEX_MAX_FILE_CHARS", 90000, 1000, 5000000),
    indexFetchConcurrency: intEnv("INDEX_FETCH_CONCURRENCY", 10, 1, 64),
    indexMaxTreePages: intEnv("INDEX_MAX_TREE_PAGES", 8, 1, 100),
    githubAppId: process.env.GITHUB_APP_ID?.trim() || "",
    githubPrivateKey: process.env.GITHUB_PRIVATE_KEY || "",
    gitlabBaseUrl: stringEnv("GITLAB_BASE_URL", "https://gitlab.com").replace(/\/$/, ""),
    gitlabToken: process.env.GITLAB_TOKEN?.trim() || "",
    webUrl: stringEnv("WEB_URL", "http://localhost:3000").replace(/\/$/, ""),
    httpTimeoutMs: intEnv("HTTP_TIMEOUT_MS", 20000, 1000, 120000),
    httpMaxAttempts: intEnv("HTTP_MAX_ATTEMPTS", 3, 1, 8),
} as const;

