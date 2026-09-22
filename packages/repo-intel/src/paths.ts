export const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
export const INDEXABLE_PATH =
  /(package\.json$|pnpm-workspace\.yaml$|lerna\.json$|nest-cli\.json$|turbo\.json$|nx\.json$|tsconfig.*\.json$|composer\.json$|go\.mod$|Gemfile$|pom\.xml$|build\.gradle|pyproject\.toml$|\.prisma$|\.entity\.ts$|\.sql$|Dockerfile|docker-compose|compose\.ya?ml$|nginx.*\.conf$|\.conf$|\.(ts|tsx|js|jsx|mjs|cjs|vue|py|go|java|rb|php|cs|kt)$)/i;
const IGNORED_DIR = /(^|\/)(node_modules|dist|build|coverage|\.next|vendor|\.turbo)(\/|$)/;

export function shouldIndexPath(path: string): boolean {
  return INDEXABLE_PATH.test(path) && !IGNORED_DIR.test(path);
}

export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

export const TENANT_FIELDS = ["tenantId", "organizationId", "orgId", "workspaceId", "companyId", "accountId", "ownerId"] as const;

const HIGH_SIGNAL =
  /package\.json$|pnpm-workspace|lerna\.json$|nest-cli\.json$|nx\.json$|turbo\.json$|tsconfig|schema\.prisma$|\.entity\.ts$|typeorm\.config|Dockerfile|docker-compose|compose\.ya?ml$|nginx|\.conf$/i;
const FRAMEWORK_SIGNAL = /(^|\/)(controllers?|guards?|modules?|entities|migrations)(\/|$)|controller\.ts$|guard\.ts$|module\.ts$|gateway\.ts$/i;

export function indexPathScore(path: string, changedRoots: Set<string>): number {
  if (HIGH_SIGNAL.test(path)) return 1000;
  if (changedRoots.has(path.split("/").slice(0, 2).join("/")) || changedRoots.has(path.split("/").slice(0, 3).join("/"))) return 700;
  if (FRAMEWORK_SIGNAL.test(path)) return 400;
  if (/libs\//.test(path) || /backend\//.test(path) || /src\//.test(path)) return 160;
  return 50;
}

export function prioritizeIndexPaths<T extends { path: string }>(entries: T[], changed: string[], max: number): T[] {
  const changedRoots = new Set(changed.flatMap((path) => [path.split("/").slice(0, 2).join("/"), path.split("/").slice(0, 3).join("/")]));
  return [...entries]
    .sort((a, b) => indexPathScore(b.path, changedRoots) - indexPathScore(a.path, changedRoots) || a.path.localeCompare(b.path))
    .slice(0, max);
}

export interface PathAlias {
  prefix: string;
  target: string;
}
