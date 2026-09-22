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
export interface ApiConfig {
    nodeEnv: string;
    port: number;
    redisUrl: string;
    githubWebhookSecret: string;
    gitlabWebhookSecret: string;
    dashboardApiKey?: string;
    bodyLimitBytes: number;
}
export function loadApiConfig(): ApiConfig {
    const nodeEnv = process.env.NODE_ENV?.trim() || "development";
    const dashboardApiKey = process.env.DASHBOARD_API_KEY?.trim() || undefined;
    if (nodeEnv === "production" && !dashboardApiKey) {
        throw new Error("DASHBOARD_API_KEY is required in production");
    }
    return {
        nodeEnv,
        port: process.env.PORT ? intEnv("PORT", 4000, 1, 65535) : intEnv("API_PORT", 4000, 1, 65535),
        redisUrl: stringEnv("REDIS_URL", "redis://localhost:6379"),
        githubWebhookSecret: stringEnv("GITHUB_WEBHOOK_SECRET"),
        gitlabWebhookSecret: stringEnv("GITLAB_WEBHOOK_SECRET"),
        dashboardApiKey,
        bodyLimitBytes: intEnv("WEBHOOK_BODY_LIMIT_BYTES", 2000000, 64000, 20000000),
    };
}

