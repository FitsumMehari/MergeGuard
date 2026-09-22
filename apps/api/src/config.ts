import { intEnv, optionalStringEnv, stringEnv } from "@mergeguard/core";

export interface ApiConfig {
  nodeEnv: string;
  port: number;
  redisUrl: string;
  githubWebhookSecret?: string;
  gitlabWebhookSecret?: string;
  dashboardApiKey?: string;
  bodyLimitBytes: number;
}

export function loadApiConfig(): ApiConfig {
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const dashboardApiKey = optionalStringEnv("DASHBOARD_API_KEY");
  if (nodeEnv === "production" && !dashboardApiKey) {
    throw new Error("DASHBOARD_API_KEY is required in production");
  }
  return {
    nodeEnv,
    port: process.env.PORT ? intEnv("PORT", 4000, 1, 65535) : intEnv("API_PORT", 4000, 1, 65535),
    redisUrl: stringEnv("REDIS_URL", "redis://localhost:6379"),
    githubWebhookSecret: optionalStringEnv("GITHUB_WEBHOOK_SECRET"),
    gitlabWebhookSecret: optionalStringEnv("GITLAB_WEBHOOK_SECRET"),
    dashboardApiKey,
    bodyLimitBytes: intEnv("WEBHOOK_BODY_LIMIT_BYTES", 2_000_000, 64_000, 20_000_000),
  };
}
