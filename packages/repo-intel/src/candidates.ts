import type { CandidateFinding, ChangedFile } from "@mergeguard/core";
import type { RepoModel } from "./model.js";
import { CODE_FILE, normalizePath } from "./paths.js";

const TYPEORM_QUERY = /\.(find|findOne|findOneBy|findBy|findAndCount|createQueryBuilder|update|delete|softDelete|remove|save|increment|decrement)\s*\(/;
const PRISMA_QUERY = /\.(findMany|findFirst|findUnique|updateMany|deleteMany)\s*\(/;

export function projectAwareCandidates(model: RepoModel, changed: ChangedFile[]): CandidateFinding[] {
  const out: CandidateFinding[] = [];
  const changedSet = new Set(changed.map((file) => normalizePath(file.path)));
  const globalGuards = model.auth.globalGuards ?? [];

  for (const route of model.routes.filter((item) => changedSet.has(item.file) && item.kind === "nestjs")) {
    const resource = /:\w+/.test(route.path) || ["POST", "PUT", "PATCH", "DELETE"].includes(route.method);
    if (globalGuards.length) {
      if (route.isPublic && resource) {
        out.push(
          candidate(
            "repo-nest-public-resource",
            "security",
            "high",
            "Public NestJS route may skip the global auth guard",
            `The changed route ${route.method} ${route.path} is marked @Public() while this repository uses global guards (${globalGuards.join(", ")}). Confirm that unauthenticated access is intentional.`,
            route.file,
            [`route=${route.method} ${route.path}`, `global guards=${globalGuards.join(", ")}`],
            0.7,
            "Keep @Public() only for login/health/webhook endpoints, or add an explicit authorization check.",
          ),
        );
      }
      continue;
    }
    if (resource && model.auth.guards.length && route.guards.length === 0) {
      out.push(
        candidate(
          "repo-nest-route-unguarded",
          "security",
          "high",
          "Changed resource route has no visible guard",
          `The changed NestJS route ${route.method} ${route.path} has no @UseGuards protection in the indexed route context, while this repository uses guards elsewhere.`,
          route.file,
          [`route=${route.method} ${route.path}`, `known guards=${model.auth.guards.join(", ")}`],
          0.69,
          "Verify whether a global guard, middleware, or downstream authorization layer protects this route.",
        ),
      );
    }
  }

  if (model.auth.tenantFields.length) {
    const usesTypeOrm = model.stack.orm.includes("typeorm");
    for (const file of changed.filter((item) => CODE_FILE.test(item.path) && item.headContent && !/\.entity\.ts$/.test(item.path))) {
      const content = file.headContent!;
      const hasQuery = PRISMA_QUERY.test(content) || (usesTypeOrm && TYPEORM_QUERY.test(content));
      if (hasQuery && !model.auth.tenantFields.some((field) => new RegExp(`\\b${field}\\b`).test(content))) {
        out.push(
          candidate(
            "repo-tenant-scope",
            "security",
            "high",
            "Database operation may bypass tenant scope",
            `This repository commonly uses tenant identifiers (${model.auth.tenantFields.join(", ")}), but a changed database operation in this file does not visibly reference one.`,
            file.path,
            [`tenant fields=${model.auth.tenantFields.join(", ")}`],
            0.62,
            "Confirm scoping is enforced by an upstream repository extension/RLS/global filter; otherwise include the tenant constraint.",
          ),
        );
      }
    }
  }

  const appPorts = model.infra.ports.filter((port) => port.kind === "app").map((port) => port.port);
  const nginxNums = model.infra.upstreams.flatMap((upstream) =>
    [...upstream.target.matchAll(/:(\d{2,5})/g)].map((match) => ({ file: upstream.file, port: Number(match[1]), target: upstream.target })),
  );
  if (appPorts.length && nginxNums.length) {
    for (const nginx of nginxNums) {
      if (!appPorts.includes(nginx.port) && changedSet.has(nginx.file)) {
        out.push(
          candidate(
            "repo-nginx-port",
            "bug",
            "high",
            "Nginx upstream port may not match application port",
            `Nginx proxies to ${nginx.target}, while indexed application listen/PORT values are ${[...new Set(appPorts)].join(", ")}.`,
            nginx.file,
            [`proxy=${nginx.target}`, `app ports=${appPorts.join(",")}`],
            0.78,
            "Align the upstream/service port with the application listener or confirm Docker service-port translation makes this intentional.",
          ),
        );
      }
    }
  }

  return dedupe(out);
}

function candidate(
  detector: string,
  category: CandidateFinding["category"],
  severity: CandidateFinding["severity"],
  title: string,
  description: string,
  file: string,
  evidence: string[],
  reviewerConfidence: number,
  remediation: string,
): CandidateFinding {
  return { detector, category, severity, title, description, file, evidence, reviewerConfidence, remediation };
}

function dedupe(items: CandidateFinding[]): CandidateFinding[] {
  const byKey = new Map<string, CandidateFinding>();
  for (const item of items) byKey.set(`${item.detector}|${item.file}|${item.evidence[0] || item.title}`, item);
  return [...byKey.values()];
}
