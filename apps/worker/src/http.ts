import { workerConfig } from "./config.js";
export async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= workerConfig.httpMaxAttempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), workerConfig.httpTimeoutMs);
        try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            if (!shouldRetry(response.status) || attempt === workerConfig.httpMaxAttempts)
                return response;
            await response.body?.cancel().catch(() => undefined);
            await delay(backoffMs(attempt, response.headers.get("retry-after")));
        }
        catch (error) {
            lastError = error;
            if (attempt === workerConfig.httpMaxAttempts)
                throw error;
            await delay(backoffMs(attempt));
        }
        finally {
            clearTimeout(timeout);
        }
    }
    throw lastError instanceof Error ? lastError : new Error("HTTP request failed");
}
function shouldRetry(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
}
function backoffMs(attempt: number, retryAfter?: string | null): number {
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds))
            return Math.min(seconds * 1000, 30000);
    }
    return Math.min(1000 * 2 ** (attempt - 1), 10000);
}
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

