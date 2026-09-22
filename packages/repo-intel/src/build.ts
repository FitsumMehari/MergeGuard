import type { IndexedFile, PackageNode, RepoModel, RouteNode } from "./model.js";
import { CODE_FILE, normalizePath } from "./paths.js";
import {
  collectPorts,
  collectTenantFields,
  collectUpstreams,
  detectWorkspaceKind,
  parseDatabaseModels,
  parsePackage,
  parseTsconfigAliases,
  parseTsFile,
} from "./parse.js";

export function buildRepositoryModel(files: IndexedFile[], sha: string): RepoModel {
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file.content]));
  const packageJsons = files.filter((file) => /package\.json$/.test(file.path));
  const workspace = detectWorkspaceKind(files);
  const pathAliases = parseTsconfigAliases(files);
  const packages = packageJsons.map((file) => parsePackage(file, packageJsons)).filter((item): item is PackageNode => Boolean(item));
  const frameworks = new Set<string>();
  const databases = new Set<string>();
  const orm = new Set<string>();
  const cache = new Set<string>();
  const infra = new Set<string>();

  for (const pkg of packages) {
    const all = pkg.dependencies;
    if (all.some((dep) => dep === "@nestjs/core")) {
      pkg.framework = "nestjs";
      frameworks.add("nestjs");
    }
    if (all.some((dep) => dep === "next")) {
      pkg.framework = "nextjs";
      frameworks.add("nextjs");
    }
    if (all.some((dep) => dep.includes("prisma"))) orm.add("prisma");
    if (all.some((dep) => /typeorm/.test(dep))) orm.add("typeorm");
    if (all.some((dep) => /drizzle/.test(dep))) orm.add("drizzle");
    if (all.some((dep) => /ioredis|redis|bullmq|@nestjs\/bull/.test(dep))) cache.add("redis");
    if (all.some((dep) => /mysql|mariadb|mysql2/.test(dep))) databases.add("mariadb");
    if (all.some((dep) => /pg|postgres/.test(dep))) databases.add("postgresql");
  }

  if (files.some((file) => /schema\.prisma$/.test(file.path))) {
    orm.add("prisma");
    for (const file of files.filter((item) => /schema\.prisma$/.test(item.path))) {
      if (/provider\s*=\s*"postgresql"/.test(file.content)) databases.add("postgresql");
      if (/provider\s*=\s*"mysql"/.test(file.content)) databases.add("mariadb");
    }
  }
  if (files.some((file) => /\.entity\.ts$/.test(file.path) || /@Entity\s*\(/.test(file.content))) orm.add("typeorm");
  if (files.some((file) => /type:\s*['"]mysql['"]/.test(file.content))) databases.add("mariadb");
  if (files.some((file) => /Dockerfile/i.test(file.path))) infra.add("docker");
  if (files.some((file) => /(docker-compose|compose\.ya?ml)/i.test(file.path))) infra.add("docker-compose");
  if (files.some((file) => /nginx|\.conf$/i.test(file.path))) infra.add("nginx");

  const imports: Record<string, string[]> = {};
  const reverseImports: Record<string, string[]> = {};
  const routes: RouteNode[] = [];
  const authGuards = new Set<string>();
  const authorizationGuards = new Set<string>();
  const globalGuards = new Set<string>();
  const tenantFields = new Set<string>();

  for (const file of files.filter((item) => CODE_FILE.test(item.path))) {
    const path = normalizePath(file.path);
    const info = parseTsFile(path, file.content, byPath, pathAliases);
    imports[path] = info.imports;
    routes.push(...info.routes);
    info.guards.forEach((guard) => {
      authGuards.add(guard);
      if (/role|permission|policy|ability|owner|access|authorization|jwt/i.test(guard)) authorizationGuards.add(guard);
    });
    info.globalGuards.forEach((guard) => {
      globalGuards.add(guard);
      authGuards.add(guard);
      if (/role|permission|policy|ability|owner|access|authorization|jwt/i.test(guard)) authorizationGuards.add(guard);
    });
    for (const field of collectTenantFields(file.content)) tenantFields.add(field);
  }

  for (const [from, deps] of Object.entries(imports)) {
    for (const dep of deps) {
      (reverseImports[dep] ??= []).push(from);
    }
  }

  return {
    version: 1,
    sha,
    generatedAt: new Date().toISOString(),
    stack: {
      monorepo: packages.length > 1 || !!workspace,
      workspace,
      frameworks: [...frameworks],
      databases: [...databases],
      orm: [...orm],
      cache: [...cache],
      infra: [...infra],
    },
    packages,
    imports,
    reverseImports,
    routes,
    dbModels: files.flatMap((file) => parseDatabaseModels(file.path, file.content)),
    auth: {
      guards: [...authGuards],
      authorizationGuards: [...authorizationGuards],
      globalGuards: [...globalGuards],
      tenantFields: [...tenantFields],
    },
    pathAliases,
    infra: {
      dockerfiles: files.filter((file) => /Dockerfile/i.test(file.path)).map((file) => file.path),
      composeFiles: files.filter((file) => /(docker-compose|compose\.ya?ml)/i.test(file.path)).map((file) => file.path),
      nginxFiles: files
        .filter((file) => /nginx|\.conf$/i.test(file.path))
        .filter((file) => /proxy_pass|server\s*\{|location\s+/.test(file.content))
        .map((file) => file.path),
      ports: files.flatMap((file) => collectPorts(file.path, file.content)),
      upstreams: files.flatMap((file) => collectUpstreams(file.path, file.content)),
    },
    files: files.map((file) => normalizePath(file.path)),
  };
}

/** Used when a repository cannot be fully indexed; changed files still get reviewed. */
export function emptyRepositoryModel(sha: string): RepoModel {
  return {
    version: 1,
    sha,
    generatedAt: new Date().toISOString(),
    stack: { monorepo: false, frameworks: [], databases: [], orm: [], cache: [], infra: [] },
    packages: [],
    imports: {},
    reverseImports: {},
    routes: [],
    dbModels: [],
    auth: { guards: [], authorizationGuards: [], globalGuards: [], tenantFields: [] },
    pathAliases: [],
    infra: { dockerfiles: [], composeFiles: [], nginxFiles: [], ports: [], upstreams: [] },
    files: [],
  };
}

export function relevantContext(model: RepoModel, changedPaths: string[], max = 50): string[] {
  const changed = new Set(changedPaths.map(normalizePath));
  const score = new Map<string, number>();
  for (const path of changed) {
    score.set(path, 100);
    for (const dep of model.imports[path] || []) {
      if (model.files.includes(dep)) score.set(dep, Math.max(score.get(dep) || 0, 70));
    }
    for (const reverse of model.reverseImports[path] || []) {
      score.set(reverse, Math.max(score.get(reverse) || 0, 65));
    }
  }
  for (const route of model.routes) {
    if (changed.has(route.file)) score.set(route.file, 100);
  }
  for (const dbModel of model.dbModels) {
    if (changed.has(dbModel.source)) score.set(dbModel.source, Math.max(score.get(dbModel.source) || 0, 80));
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([path]) => path);
}

export function summarizeRepoModel(model: RepoModel) {
  return {
    stack: model.stack,
    packages: model.packages.map((pkg) => ({
      path: pkg.path,
      name: pkg.name,
      framework: pkg.framework,
      workspaceDependencies: pkg.workspaceDependencies,
    })),
    routes: model.routes.slice(0, 120),
    databaseModels: model.dbModels.slice(0, 80).map((dbModel) => ({
      name: dbModel.name,
      fields: dbModel.fields,
      unique: dbModel.unique,
      indexes: dbModel.indexes,
    })),
    auth: model.auth,
    infra: model.infra,
  };
}
