import { boolEnv, floatEnv, intEnv, loadWorkspaceEnv, optionalStringEnv, stringEnv } from "@mergeguard/core";

loadWorkspaceEnv();

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const requireJev = boolEnv("REQUIRE_JEV", nodeEnv === "production");
if (requireJev && !optionalStringEnv("TYPESAFE_API_KEY")) {
  throw new Error("TYPESAFE_API_KEY is required when REQUIRE_JEV=true");
}

export const workerConfig = {
  nodeEnv,
  requireJev,
  redisUrl: stringEnv("REDIS_URL", "redis://localhost:6379"),
  concurrency: intEnv("WORKER_CONCURRENCY", 3, 1, 32),
  reportConfidenceThreshold: floatEnv("REPORT_CONFIDENCE_THRESHOLD", 0.72),
  maxRelatedFiles: intEnv("MAX_RELATED_FILES", 50, 1, 200),
  maxChangedFiles: intEnv("MAX_CHANGED_FILES", 120, 1, 500),
  maxFileContentChars: intEnv("MAX_FILE_CONTENT_CHARS", 48000, 1000, 500000),
  indexMaxFiles: intEnv("INDEX_MAX_FILES", 800, 10, 8000),
  indexMaxFileBytes: intEnv("INDEX_MAX_FILE_BYTES", 120000, 1000, 5000000),
  indexMaxFileChars: intEnv("INDEX_MAX_FILE_CHARS", 120000, 1000, 5000000),
  indexFetchConcurrency: intEnv("INDEX_FETCH_CONCURRENCY", 12, 1, 64),
  indexMaxTreePages: intEnv("INDEX_MAX_TREE_PAGES", 80, 1, 200),
  githubAppId: optionalStringEnv("GITHUB_APP_ID") ?? "",
  githubPrivateKey: process.env.GITHUB_PRIVATE_KEY || "",
  gitlabBaseUrl: stringEnv("GITLAB_BASE_URL", "https://gitlab.com").replace(/\/$/, ""),
  gitlabToken: optionalStringEnv("GITLAB_TOKEN") ?? "",
  gitlabProjectTokens: parseProjectTokens(optionalStringEnv("GITLAB_PROJECT_TOKENS")),
  webUrl: stringEnv("WEB_URL", "http://localhost:3000").replace(/\/$/, ""),
  httpTimeoutMs: intEnv("HTTP_TIMEOUT_MS", 20000, 1000, 120000),
  httpMaxAttempts: intEnv("HTTP_MAX_ATTEMPTS", 3, 1, 8),
} as const;

function parseProjectTokens(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
    );
  } catch {
    throw new Error("GITLAB_PROJECT_TOKENS must be a JSON object of projectId → token");
  }
}
