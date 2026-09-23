import crypto from "node:crypto";

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyGithubSignature(body: string, signature: string, secret: string): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const digest = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  return timingSafeEqualString(digest, signature);
}

export function parseBearer(header?: string): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7).trim() || undefined;
}

export function isPrismaUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

export function isDuplicateJobError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /job.*already exists|jobid.*exists|duplicate/i.test(message);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function githubAnalysisKey(payload: Record<string, unknown>): string {
  const repository = asRecord(payload.repository);
  const pullRequest = asRecord(payload.pull_request);
  const head = asRecord(pullRequest.head);
  const repo = readString(repository.id, "unknown-repo");
  const number = readString(pullRequest.number, "unknown-pr");
  const sha = readString(head.sha, readString(payload.after, "unknown-sha"));
  return `${repo}-${number}-${sha}`;
}

export function gitlabAnalysisKey(payload: Record<string, unknown>): string {
  const project = asRecord(payload.project);
  const attributes = asRecord(payload.object_attributes);
  const lastCommit = asRecord(attributes.last_commit);
  const projectId = readString(project.id, "unknown-project");
  const iid = readString(attributes.iid, "unknown-mr");
  const sha = readString(lastCommit.id, readString(lastCommit.sha, "unknown-sha"));
  return `${projectId}-${iid}-${sha}`;
}
