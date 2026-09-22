export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

const SOURCE_CONTENT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|py|go|java|rb|php|cs|kt|json|sql|prisma|yml|yaml)$/;

export function shouldFetchHeadContent(path: string): boolean {
  return SOURCE_CONTENT.test(path);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function readNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.message}${error.stack ? `\n${error.stack}` : ""}` : String(error);
  return message.replace(/(Bearer|token|PRIVATE-TOKEN)[^\s,]+/gi, "[redacted]").slice(0, 10000);
}

export function logJson(level: "info" | "error", event: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...extra, ts: new Date().toISOString() });
  if (level === "error") console.error(line);
  else console.info(line);
}
