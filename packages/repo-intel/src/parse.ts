import ts from "typescript";
import type { IndexedFile, PackageNode, RouteNode, DbModel } from "./model.js";
import { normalizePath, TENANT_FIELDS, type PathAlias } from "./paths.js";

export function parsePackage(file: IndexedFile, all: IndexedFile[]): PackageNode | null {
  try {
    const json = JSON.parse(file.content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const deps = { ...(json.dependencies || {}), ...(json.devDependencies || {}), ...(json.peerDependencies || {}) };
    const path = normalizePath(file.path.replace(/\/?package\.json$/, "")) || ".";
    const names = new Set(
      all
        .map((item) => {
          try {
            return (JSON.parse(item.content) as { name?: string }).name;
          } catch {
            return undefined;
          }
        })
        .filter((name): name is string => Boolean(name)),
    );
    return {
      path,
      name: json.name || path,
      dependencies: Object.keys(deps),
      workspaceDependencies: Object.keys(deps).filter((dep) => names.has(dep)),
    };
  } catch {
    return null;
  }
}

export function detectWorkspaceKind(files: IndexedFile[]): string | undefined {
  if (files.some((file) => file.path.endsWith("pnpm-workspace.yaml"))) return "pnpm";
  if (files.some((file) => file.path.endsWith("lerna.json"))) return "lerna";
  if (files.some((file) => file.path.endsWith("nx.json"))) return "nx";
  if (files.some((file) => file.path.endsWith("turbo.json"))) return "turborepo";
  if (files.some((file) => file.path.endsWith("nest-cli.json"))) return "nest";
  return detectWorkspacePackage(files.filter((file) => /package\.json$/.test(file.path)));
}

export function detectWorkspacePackage(files: IndexedFile[]): string | undefined {
  for (const file of files) {
    try {
      const json = JSON.parse(file.content) as { workspaces?: unknown };
      if (json.workspaces) return "npm/yarn";
    } catch {
      /* ignore malformed package.json */
    }
  }
  return undefined;
}

export function parseTsconfigAliases(files: IndexedFile[]): PathAlias[] {
  const aliases: PathAlias[] = [];
  for (const file of files.filter((item) => /tsconfig.*\.json$/i.test(item.path))) {
    const json = parseJsonc(file.content);
    const paths = json?.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") continue;
    const baseDir = normalizePath(file.path.replace(/\/?tsconfig[^/]*$/, "")) || ".";
    for (const [pattern, targets] of Object.entries(paths)) {
      const prefix = pattern.replace(/\/\*$/, "");
      const rawTarget = Array.isArray(targets) ? String(targets[0] ?? "") : String(targets ?? "");
      const target = normalizePath(`${baseDir}/${rawTarget.replace(/\/\*$/, "")}`);
      if (prefix && target) aliases.push({ prefix, target });
    }
  }
  return aliases.sort((a, b) => b.prefix.length - a.prefix.length);
}

export function parseTsFile(path: string, content: string, byPath: Map<string, string>, aliases: PathAlias[] = []) {
  const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: string[] = [];
  const routes: RouteNode[] = [];
  const guards = new Set<string>();
  const globalGuards = collectGlobalGuards(content);
  globalGuards.forEach((guard) => guards.add(guard));

  const resolve = (spec: string) => {
    const aliased = resolveAlias(spec, aliases, byPath);
    if (aliased) return aliased;
    if (!spec.startsWith(".")) return spec;
    const base = normalizePath(path.split("/").slice(0, -1).join("/") + "/" + spec);
    const tries = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`];
    return tries.find((candidate) => byPath.has(candidate)) || base;
  };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push(resolve(statement.moduleSpecifier.text));
    }
  }

  if (/@Controller\s*\(/.test(content)) {
    const prefix = controllerPrefix(content);
    const classGuards = decoratorArgs(content, "UseGuards");
    const classPublic = /@Public\s*\(/.test(content.slice(0, content.indexOf("@Controller")));
    classGuards.forEach((guard) => guards.add(guard));
    const methodRe = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)[\s\S]{0,500}?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
    for (const match of content.matchAll(methodRe)) {
      const before = content.slice(Math.max(0, match.index! - 500), match.index!);
      const local = decoratorArgs(before, "UseGuards");
      local.forEach((guard) => guards.add(guard));
      routes.push({
        file: path,
        method: match[1]!.toUpperCase(),
        path: joinRoute(prefix, match[2] || ""),
        handler: match[3],
        guards: [...new Set([...classGuards, ...local])],
        kind: "nestjs",
        isPublic: classPublic || /@Public\s*\(/.test(before),
      });
    }
  }

  if (/@WebSocketGateway\s*\(/.test(content) || /@SubscribeMessage\s*\(/.test(content)) {
    const classGuards = decoratorArgs(content, "UseGuards");
    classGuards.forEach((guard) => guards.add(guard));
    for (const match of content.matchAll(/@SubscribeMessage\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
      const before = content.slice(Math.max(0, match.index! - 400), match.index!);
      const local = decoratorArgs(before, "UseGuards");
      routes.push({
        file: path,
        method: "MESSAGE",
        path: `/${match[1]}`,
        guards: [...new Set([...classGuards, ...local])],
        kind: "nestjs",
      });
    }
  }

  if (/(^|\/)app\/.+\/route\.(ts|js)$/.test(path)) {
    const route =
      "/" +
      path
        .replace(/^.*?app\//, "")
        .replace(/\/route\.(ts|js)$/, " ")
        .trim()
        .replace(/\([^/]+\)\//g, "")
        .replace(/\[(\.\.\.)?([^\]]+)\]/g, ":$2");
    for (const match of content.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)) {
      routes.push({ file: path, method: match[1]!, path: route, guards: [], kind: "nextjs" });
    }
  }
  return { imports: [...new Set(imports)], routes, guards: [...guards], globalGuards };
}

export function collectGlobalGuards(content: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(/provide\s*:\s*APP_GUARD[\s\S]{0,240}?useClass\s*:\s*([A-Za-z_$][\w$]*)/g)) {
    out.push(match[1]!);
  }
  return out;
}

export function decoratorArgs(text: string, name: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(new RegExp(`@${name}\\s*\\(([^)]*)\\)`, "g"))) {
    for (const item of match[1]!.split(",")) {
      const value = item.trim().replace(/\(.*$/, "");
      if (value) out.push(value);
    }
  }
  return out;
}

export function parsePrisma(path: string, content: string): DbModel[] {
  const out: DbModel[] = [];
  for (const match of content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const body = match[2]!;
    const fields: string[] = [];
    const unique: string[] = [];
    const indexes: string[] = [];
    for (const line of body.split("\n").map((item) => item.trim()).filter(Boolean)) {
      if (line.startsWith("@@unique")) unique.push(line);
      else if (line.startsWith("@@index")) indexes.push(line);
      else if (!line.startsWith("//") && !line.startsWith("@@")) {
        const name = line.match(/^(\w+)\s+/)?.[1];
        if (name) {
          fields.push(name);
          if (/@unique\b/.test(line)) unique.push(name);
        }
      }
    }
    out.push({ name: match[1]!, fields, unique, indexes, source: path });
  }
  return out;
}

export function parseTypeOrm(path: string, content: string): DbModel[] {
  if (!/@Entity\s*\(/.test(content)) return [];
  const name = content.match(/export\s+(?:abstract\s+)?class\s+(\w+)/)?.[1];
  if (!name) return [];
  const fields: string[] = [];
  const unique: string[] = [];
  const indexes: string[] = [];
  for (const match of content.matchAll(/@(?:PrimaryGeneratedColumn|PrimaryColumn|Column|CreateDateColumn|UpdateDateColumn|DeleteDateColumn)\s*\(([\s\S]*?)\)\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)/g)) {
    const options = match[1] || "";
    const field = match[2]!;
    fields.push(field);
    if (/unique\s*:\s*true/.test(options)) unique.push(field);
  }
  for (const match of content.matchAll(/@Index\s*\(([\s\S]*?)\)/g)) indexes.push(match[1]!.replace(/\s+/g, " ").trim().slice(0, 120));
  for (const match of content.matchAll(/@Unique\s*\(([\s\S]*?)\)/g)) unique.push(match[1]!.replace(/\s+/g, " ").trim().slice(0, 120));
  return [{ name, fields, unique, indexes, source: path }];
}

export function parseDatabaseModels(path: string, content: string): DbModel[] {
  if (/schema\.prisma$/.test(path)) return parsePrisma(path, content);
  if (/\.entity\.ts$/.test(path) || /@Entity\s*\(/.test(content)) return parseTypeOrm(path, content);
  return [];
}

export function collectPorts(path: string, content: string): Array<{ file: string; port: number; kind: string }> {
  const ports: Array<{ file: string; port: number; kind: string }> = [];
  for (const match of content.matchAll(/\b(?:EXPOSE|listen\s*\(|listen\s+|PORT\s*[:=])\s*['"]?(\d{2,5})/g)) {
    ports.push({
      file: path,
      port: Number(match[1]),
      kind: /nginx|\.conf$/.test(path) ? "nginx" : /Dockerfile/.test(path) ? "docker" : "app",
    });
  }
  return ports;
}

export function collectUpstreams(path: string, content: string): Array<{ file: string; target: string }> {
  const upstreams: Array<{ file: string; target: string }> = [];
  for (const match of content.matchAll(/proxy_pass\s+https?:\/\/([^;\s]+)/g)) {
    upstreams.push({ file: path, target: match[1]! });
  }
  return upstreams;
}

export function collectTenantFields(content: string): string[] {
  return TENANT_FIELDS.filter((field) => new RegExp(`\\b${field}\\b`).test(content));
}

function resolveAlias(spec: string, aliases: PathAlias[], byPath: Map<string, string>): string | undefined {
  const alias = aliases.find((item) => spec === item.prefix || spec.startsWith(`${item.prefix}/`));
  if (!alias) return undefined;
  const rest = spec === alias.prefix ? "" : spec.slice(alias.prefix.length + 1);
  const base = normalizePath(rest ? `${alias.target}/${rest}` : alias.target);
  const tries = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`];
  return tries.find((candidate) => byPath.has(candidate)) || base;
}

function controllerPrefix(content: string): string {
  const stringPrefix = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]/);
  if (stringPrefix) return stringPrefix[1] || "";
  const objectPrefix = content.match(/@Controller\s*\(\s*\{[\s\S]*?path\s*:\s*['"`]([^'"`]*)['"`]/);
  return objectPrefix?.[1] || "";
}

function joinRoute(prefix: string, leaf: string): string {
  return ("/" + prefix + "/" + leaf).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function parseJsonc(text: string): { compilerOptions?: { paths?: Record<string, string[] | string> } } | null {
  try {
    return JSON.parse(text) as { compilerOptions?: { paths?: Record<string, string[] | string> } };
  } catch {
    try {
      return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")) as {
        compilerOptions?: { paths?: Record<string, string[] | string> };
      };
    } catch {
      return null;
    }
  }
}
