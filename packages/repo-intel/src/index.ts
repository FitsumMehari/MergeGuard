import ts from "typescript";
import type { CandidateFinding, ChangedFile } from "@mergeguard/core";
export interface IndexedFile {
    path: string;
    content: string;
    size?: number;
}
export interface PackageNode {
    path: string;
    name: string;
    framework?: string;
    dependencies: string[];
    workspaceDependencies: string[];
}
export interface RouteNode {
    file: string;
    method: string;
    path: string;
    handler?: string;
    guards: string[];
    kind: "nestjs" | "nextjs";
}
export interface DbModel {
    name: string;
    fields: string[];
    unique: string[];
    indexes: string[];
    source: string;
}
export interface RepoModel {
    version: 1;
    sha: string;
    generatedAt: string;
    stack: {
        monorepo: boolean;
        workspace?: string;
        frameworks: string[];
        databases: string[];
        orm: string[];
        cache: string[];
        infra: string[];
    };
    packages: PackageNode[];
    imports: Record<string, string[]>;
    reverseImports: Record<string, string[]>;
    routes: RouteNode[];
    dbModels: DbModel[];
    auth: {
        guards: string[];
        authorizationGuards: string[];
        tenantFields: string[];
    };
    infra: {
        dockerfiles: string[];
        composeFiles: string[];
        nginxFiles: string[];
        ports: Array<{
            file: string;
            port: number;
            kind: string;
        }>;
        upstreams: Array<{
            file: string;
            target: string;
        }>;
    };
    files: string[];
}
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const RELEVANT = /(package\.json$|pnpm-workspace\.yaml$|turbo\.json$|nx\.json$|tsconfig.*\.json$|\.prisma$|\.sql$|Dockerfile|docker-compose|compose\.ya?ml$|nginx.*\.conf$|\.conf$|\.(ts|tsx|js|jsx|mjs|cjs)$)/i;
export function shouldIndexPath(path: string) { return RELEVANT.test(path) && !/(^|\/)(node_modules|dist|build|coverage|\.next|vendor)(\/|$)/.test(path); }
export function buildRepositoryModel(files: IndexedFile[], sha: string): RepoModel {
    const byPath = new Map(files.map(f => [norm(f.path), f.content]));
    const packageJsons = files.filter(f => /package\.json$/.test(f.path));
    const workspace = files.some(f => f.path.endsWith("pnpm-workspace.yaml")) ? "pnpm" : files.some(f => f.path.endsWith("nx.json")) ? "nx" : files.some(f => f.path.endsWith("turbo.json")) ? "turborepo" : detectWorkspacePackage(packageJsons);
    const packages: PackageNode[] = packageJsons.map(f => parsePackage(f, packageJsons)).filter(Boolean) as PackageNode[];
    const frameworks = new Set<string>(), databases = new Set<string>(), orm = new Set<string>(), cache = new Set<string>(), infra = new Set<string>();
    for (const p of packages) {
        const all = p.dependencies;
        if (all.some(x => x === "@nestjs/core")) {
            p.framework = "nestjs";
            frameworks.add("nestjs");
        }
        ;
        if (all.some(x => x === "next")) {
            p.framework = "nextjs";
            frameworks.add("nextjs");
        }
        ;
        if (all.some(x => x.includes("prisma"))) {
            orm.add("prisma");
        }
        ;
        if (all.some(x => /typeorm/.test(x)))
            orm.add("typeorm");
        if (all.some(x => /drizzle/.test(x)))
            orm.add("drizzle");
        if (all.some(x => /ioredis|redis|bullmq|@nestjs\/bull/.test(x)))
            cache.add("redis");
        if (all.some(x => /mysql|mariadb/.test(x)))
            databases.add("mariadb");
        if (all.some(x => /pg|postgres/.test(x)))
            databases.add("postgresql");
    }
    if (files.some(f => /schema\.prisma$/.test(f.path))) {
        orm.add("prisma");
        for (const f of files.filter(f => /schema\.prisma$/.test(f.path))) {
            if (/provider\s*=\s*"postgresql"/.test(f.content))
                databases.add("postgresql");
            if (/provider\s*=\s*"mysql"/.test(f.content))
                databases.add("mariadb");
        }
    }
    if (files.some(f => /Dockerfile/i.test(f.path))) {
        infra.add("docker");
    }
    ;
    if (files.some(f => /(docker-compose|compose\.ya?ml)/i.test(f.path)))
        infra.add("docker-compose");
    if (files.some(f => /nginx|\.conf$/i.test(f.path)))
        infra.add("nginx");
    const imports: Record<string, string[]> = {};
    const reverseImports: Record<string, string[]> = {};
    const routes: RouteNode[] = [];
    const authGuards = new Set<string>(), authorizationGuards = new Set<string>(), tenantFields = new Set<string>();
    for (const f of files.filter(f => CODE.test(f.path))) {
        const p = norm(f.path);
        const info = parseTsFile(p, f.content, byPath);
        imports[p] = info.imports;
        routes.push(...info.routes);
        info.guards.forEach(g => { authGuards.add(g); if (/role|permission|policy|ability|owner|access|authorization/i.test(g))
            authorizationGuards.add(g); });
        for (const tf of ["tenantId", "organizationId", "workspaceId", "companyId", "accountId"]) {
            if (new RegExp(`\\b${tf}\\b`).test(f.content))
                tenantFields.add(tf);
        }
    }
    for (const [from, deps] of Object.entries(imports))
        for (const d of deps)
            (reverseImports[d] ??= []).push(from);
    const dbModels = files.flatMap(f => /schema\.prisma$/.test(f.path) ? parsePrisma(f.path, f.content) : []);
    const dockerfiles = files.filter(f => /Dockerfile/i.test(f.path)).map(f => f.path), composeFiles = files.filter(f => /(docker-compose|compose\.ya?ml)/i.test(f.path)).map(f => f.path), nginxFiles = files.filter(f => /nginx|\.conf$/i.test(f.path)).filter(f => /proxy_pass|server\s*\{|location\s+/.test(f.content)).map(f => f.path);
    const ports: Array<{
        file: string;
        port: number;
        kind: string;
    }> = [], upstreams: Array<{
        file: string;
        target: string;
    }> = [];
    for (const f of files) {
        for (const m of f.content.matchAll(/\b(?:EXPOSE|listen\s*\(|listen\s+|PORT\s*[:=])\s*['"]?(\d{2,5})/g))
            ports.push({ file: f.path, port: Number(m[1]), kind: /nginx|\.conf$/.test(f.path) ? "nginx" : /Dockerfile/.test(f.path) ? "docker" : "app" });
        for (const m of f.content.matchAll(/proxy_pass\s+https?:\/\/([^;\s]+)/g))
            upstreams.push({ file: f.path, target: m[1] });
    }
    return { version: 1, sha, generatedAt: new Date().toISOString(), stack: { monorepo: packages.length > 1 || !!workspace, workspace, frameworks: [...frameworks], databases: [...databases], orm: [...orm], cache: [...cache], infra: [...infra] }, packages, imports, reverseImports, routes, dbModels, auth: { guards: [...authGuards], authorizationGuards: [...authorizationGuards], tenantFields: [...tenantFields] }, infra: { dockerfiles, composeFiles, nginxFiles, ports, upstreams }, files: files.map(f => norm(f.path)) };
}
function parsePackage(f: IndexedFile, all: IndexedFile[]): PackageNode | null { try {
    const x = JSON.parse(f.content);
    const deps = { ...(x.dependencies || {}), ...(x.devDependencies || {}), ...(x.peerDependencies || {}) };
    const path = norm(f.path.replace(/\/?package\.json$/, "")) || ".";
    const names = new Set(all.map(p => { try {
        return JSON.parse(p.content).name;
    }
    catch {
        return undefined;
    } }).filter(Boolean));
    return { path, name: x.name || path, dependencies: Object.keys(deps), workspaceDependencies: Object.keys(deps).filter(d => names.has(d)) };
}
catch {
    return null;
} }
function detectWorkspacePackage(fs: IndexedFile[]) { for (const f of fs) {
    try {
        const x = JSON.parse(f.content);
        if (x.workspaces)
            return "npm/yarn";
    }
    catch { }
} return undefined; }
function parseTsFile(path: string, content: string, byPath: Map<string, string>) {
    const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imports: string[] = [], routes: RouteNode[] = [], guards = new Set<string>();
    const resolve = (spec: string) => { if (!spec.startsWith("."))
        return spec; const base = norm(path.split("/").slice(0, -1).join("/") + "/" + spec); const tries = [base, base + ".ts", base + ".tsx", base + ".js", base + "/index.ts", base + "/index.tsx"]; return tries.find(t => byPath.has(t)) || base; };
    for (const st of sf.statements) {
        if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier))
            imports.push(resolve(st.moduleSpecifier.text));
    }
    const text = content;
    if (/@Controller\s*\(/.test(text)) {
        const prefix = (text.match(/@Controller\s*\(\s*['"`]([^'"`]*)/) || [])[1] || "";
        const classGuards = decoratorArgs(text, "UseGuards");
        classGuards.forEach(g => guards.add(g));
        const methodRe = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)[\s\S]{0,500}?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
        for (const m of text.matchAll(methodRe)) {
            const before = text.slice(Math.max(0, m.index! - 400), m.index!);
            const local = decoratorArgs(before, "UseGuards");
            local.forEach(g => guards.add(g));
            routes.push({ file: path, method: m[1].toUpperCase(), path: ("/" + prefix + "/" + (m[2] || "")).replace(/\/+/g, "/").replace(/\/$/, "") || "/", handler: m[3], guards: [...new Set([...classGuards, ...local])], kind: "nestjs" });
        }
    }
    if (/(^|\/)app\/.+\/route\.(ts|js)$/.test(path)) {
        const route = "/" + path.replace(/^.*?app\//, "").replace(/\/route\.(ts|js)$/, " ").trim().replace(/\([^/]+\)\//g, "").replace(/\[(\.\.\.)?([^\]]+)\]/g, ":$2");
        for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g))
            routes.push({ file: path, method: m[1], path: route, guards: [], kind: "nextjs" });
    }
    return { imports: [...new Set(imports)], routes, guards: [...guards] };
}
function decoratorArgs(text: string, name: string) { const out: string[] = []; for (const m of text.matchAll(new RegExp(`@${name}\\s*\\(([^)]*)\\)`, `g`)))
    for (const x of m[1].split(",")) {
        const v = x.trim().replace(/\(.*$/, '');
        if (v)
            out.push(v);
    } return out; }
function parsePrisma(path: string, content: string): DbModel[] { const out: DbModel[] = []; for (const m of content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const body = m[2], fields: string[] = [], unique: string[] = [], indexes: string[] = [];
    for (const line of body.split("\n").map(x => x.trim()).filter(Boolean)) {
        if (line.startsWith("@@unique"))
            unique.push(line);
        else if (line.startsWith("@@index"))
            indexes.push(line);
        else if (!line.startsWith("//") && !line.startsWith("@@")) {
            const n = line.match(/^(\w+)\s+/)?.[1];
            if (n) {
                fields.push(n);
                if (/@unique\b/.test(line))
                    unique.push(n);
            }
        }
    }
    out.push({ name: m[1], fields, unique, indexes, source: path });
} return out; }
function norm(p: string) { const parts: string[] = []; for (const x of p.replace(/\\/g, "/").split("/")) {
    if (!x || x === '.')
        continue;
    if (x === '..')
        parts.pop();
    else
        parts.push(x);
} return parts.join("/"); }
export function relevantContext(model: RepoModel, changedPaths: string[], max = 30) { const changed = new Set(changedPaths.map(norm)); const score = new Map<string, number>(); for (const p of changed) {
    score.set(p, 100);
    for (const d of model.imports[p] || [])
        if (model.files.includes(d))
            score.set(d, Math.max(score.get(d) || 0, 70));
    for (const r of model.reverseImports[p] || [])
        score.set(r, Math.max(score.get(r) || 0, 65));
} for (const r of model.routes)
    if (changed.has(r.file))
        score.set(r.file, 100); return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([path]) => path); }
export function projectAwareCandidates(model: RepoModel, changed: ChangedFile[]): CandidateFinding[] {
    const out: CandidateFinding[] = [];
    const changedSet = new Set(changed.map(f => norm(f.path)));
    // Nest route auth/authorization awareness: only flag object-id routes when repo clearly uses guards elsewhere and this route has none.
    for (const r of model.routes.filter(r => changedSet.has(r.file) && r.kind === "nestjs"))
        if (/:\w+/.test(r.path) && model.auth.guards.length && r.guards.length === 0) {
            out.push(candidate("repo-nest-route-unguarded", "security", "high", "Changed resource route has no visible guard", `The changed NestJS route ${r.method} ${r.path} has no @UseGuards protection in the indexed route context, while this repository uses guards elsewhere.`, r.file, [`route=${r.method} ${r.path}`, `known guards=${model.auth.guards.join(", ")}`], .69, "Verify whether a global guard, middleware, or downstream authorization layer protects this route."));
        }
    // Tenant-scoping heuristic: changed DB query mentions model operation but no common tenant field.
    if (model.auth.tenantFields.length) {
        for (const f of changed.filter(f => CODE.test(f.path) && f.headContent)) {
            const c = f.headContent!;
            if (/\.(findMany|findFirst|findUnique|updateMany|deleteMany)\s*\(/.test(c) && !model.auth.tenantFields.some(t => new RegExp(`\\b${t}\\b`).test(c))) {
                out.push(candidate("repo-tenant-scope", "security", "high", "Database operation may bypass tenant scope", `This repository commonly uses tenant identifiers (${model.auth.tenantFields.join(", ")}), but a changed database operation in this file does not visibly reference one.`, f.path, [`tenant fields=${model.auth.tenantFields.join(", ")}`], .62, "Confirm scoping is enforced by an upstream repository extension/RLS/global filter; otherwise include the tenant constraint."));
            }
        }
    }
    // Port mismatch: app port changed/exists and nginx points to a different numeric target.
    const appPorts = model.infra.ports.filter(p => p.kind === "app").map(p => p.port), nginxNums = model.infra.upstreams.flatMap(u => [...(u.target.matchAll(/:(\d{2,5})/g))].map(m => ({ file: u.file, port: Number(m[1]), target: u.target })));
    if (appPorts.length && nginxNums.length) {
        for (const n of nginxNums)
            if (!appPorts.includes(n.port) && changedSet.has(n.file)) {
                out.push(candidate("repo-nginx-port", "bug", "high", "Nginx upstream port may not match application port", `Nginx proxies to ${n.target}, while indexed application listen/PORT values are ${[...new Set(appPorts)].join(", ")}.`, n.file, [`proxy=${n.target}`, `app ports=${appPorts.join(",")}`], .78, "Align the upstream/service port with the application listener or confirm Docker service-port translation makes this intentional."));
            }
    }
    return dedupe(out);
}
function candidate(detector: string, category: any, severity: any, title: string, description: string, file: string, evidence: string[], reviewerConfidence: number, remediation: string): CandidateFinding { return { detector, category, severity, title, description, file, evidence, reviewerConfidence, remediation }; }
function dedupe(xs: CandidateFinding[]) { const m = new Map<string, CandidateFinding>(); for (const x of xs)
    m.set(`${x.detector}|${x.file}|${x.title}`, x); return [...m.values()]; }
export function summarizeRepoModel(model: RepoModel) { return { stack: model.stack, packages: model.packages.map(p => ({ path: p.path, name: p.name, framework: p.framework, workspaceDependencies: p.workspaceDependencies })), routes: model.routes.slice(0, 80), databaseModels: model.dbModels.slice(0, 60).map(m => ({ name: m.name, fields: m.fields, unique: m.unique, indexes: m.indexes })), auth: model.auth, infra: model.infra }; }
/** Incrementally overlays changed source/config files onto a cached base-commit model. */
export function applyChangedFiles(base: RepoModel, changed: ChangedFile[]): RepoModel {
    const m: RepoModel = JSON.parse(JSON.stringify(base));
    const paths = new Set(changed.map(f => norm(f.path)));
    const existing = new Map<string, string>();
    for (const p of m.files)
        existing.set(p, "");
    for (const f of changed)
        if (f.status !== "deleted" && f.headContent != null)
            existing.set(norm(f.path), f.headContent);
    m.files = m.files.filter(p => !paths.has(p));
    for (const f of changed)
        if (f.status !== "deleted" && !m.files.includes(norm(f.path)))
            m.files.push(norm(f.path));
    m.routes = m.routes.filter(r => !paths.has(r.file));
    m.dbModels = m.dbModels.filter(d => !paths.has(d.source));
    for (const p of paths) {
        delete m.imports[p];
        delete m.reverseImports[p];
    }
    for (const [p, rev] of Object.entries(m.reverseImports))
        m.reverseImports[p] = rev.filter(x => !paths.has(x));
    m.infra.ports = m.infra.ports.filter(x => !paths.has(norm(x.file)));
    m.infra.upstreams = m.infra.upstreams.filter(x => !paths.has(norm(x.file)));
    for (const f of changed) {
        if (f.status === "deleted" || !f.headContent)
            continue;
        const p = norm(f.path), c = f.headContent;
        if (CODE.test(p)) {
            const info = parseTsFile(p, c, existing);
            m.imports[p] = info.imports;
            m.routes.push(...info.routes);
            for (const g of info.guards) {
                if (!m.auth.guards.includes(g))
                    m.auth.guards.push(g);
                if (/role|permission|policy|ability|owner|access|authorization/i.test(g) && !m.auth.authorizationGuards.includes(g))
                    m.auth.authorizationGuards.push(g);
            }
            for (const tf of ["tenantId", "organizationId", "workspaceId", "companyId", "accountId"])
                if (new RegExp(`\\b${tf}\\b`).test(c) && !m.auth.tenantFields.includes(tf))
                    m.auth.tenantFields.push(tf);
        }
        if (/schema\.prisma$/.test(p))
            m.dbModels.push(...parsePrisma(p, c));
        for (const x of c.matchAll(/\b(?:EXPOSE|listen\s*\(|listen\s+|PORT\s*[:=])\s*['"]?(\d{2,5})/g))
            m.infra.ports.push({ file: p, port: Number(x[1]), kind: /nginx|\.conf$/.test(p) ? "nginx" : /Dockerfile/.test(p) ? "docker" : "app" });
        for (const x of c.matchAll(/proxy_pass\s+https?:\/\/([^;\s]+)/g))
            m.infra.upstreams.push({ file: p, target: x[1] });
    }
    for (const [from, deps] of Object.entries(m.imports))
        for (const d of deps) {
            if (!m.files.includes(d))
                continue;
            (m.reverseImports[d] ??= []);
            if (!m.reverseImports[d].includes(from))
                m.reverseImports[d].push(from);
        }
    return m;
}

