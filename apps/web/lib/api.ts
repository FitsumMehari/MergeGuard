const base = process.env.API_URL || "http://localhost:4000";
const apiKey = process.env.DASHBOARD_API_KEY;
export async function api<T>(path: string): Promise<T> {
    const response = await fetch(`${base}${path}`, {
        cache: "no-store",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!response.ok)
        throw new Error(`MergeGuard API request failed with ${response.status}`);
    return response.json() as Promise<T>;
}

