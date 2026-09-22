import type { ChangedFile } from "@mergeguard/core";
import type { RepoModel } from "./model.js";
import { CODE_FILE, normalizePath } from "./paths.js";
import { collectPorts, collectTenantFields, collectUpstreams, parseDatabaseModels, parseTsFile } from "./parse.js";

export function applyChangedFiles(base: RepoModel, changed: ChangedFile[]): RepoModel {
  const model: RepoModel = structuredClone(base);
  model.auth.globalGuards ??= [];
  model.pathAliases ??= [];
  const aliases = model.pathAliases;
  const paths = new Set(changed.map((file) => normalizePath(file.path)));
  const existing = new Map<string, string>();
  for (const path of model.files) existing.set(path, "");
  for (const file of changed) {
    if (file.status !== "deleted" && file.headContent != null) {
      existing.set(normalizePath(file.path), file.headContent);
    }
  }
  model.files = model.files.filter((path) => !paths.has(path));
  for (const file of changed) {
    if (file.status !== "deleted" && !model.files.includes(normalizePath(file.path))) {
      model.files.push(normalizePath(file.path));
    }
  }
  model.routes = model.routes.filter((route) => !paths.has(route.file));
  model.dbModels = model.dbModels.filter((dbModel) => !paths.has(dbModel.source));
  for (const path of paths) {
    delete model.imports[path];
    delete model.reverseImports[path];
  }
  for (const [path, reverse] of Object.entries(model.reverseImports)) {
    model.reverseImports[path] = reverse.filter((item) => !paths.has(item));
  }
  model.infra.ports = model.infra.ports.filter((item) => !paths.has(normalizePath(item.file)));
  model.infra.upstreams = model.infra.upstreams.filter((item) => !paths.has(normalizePath(item.file)));

  for (const file of changed) {
    if (file.status === "deleted" || !file.headContent) continue;
    const path = normalizePath(file.path);
    const content = file.headContent;
    if (CODE_FILE.test(path)) {
      const info = parseTsFile(path, content, existing, aliases);
      model.imports[path] = info.imports;
      model.routes.push(...info.routes);
      for (const guard of info.guards) {
        if (!model.auth.guards.includes(guard)) model.auth.guards.push(guard);
        if (/role|permission|policy|ability|owner|access|authorization|jwt/i.test(guard) && !model.auth.authorizationGuards.includes(guard)) {
          model.auth.authorizationGuards.push(guard);
        }
      }
      for (const guard of info.globalGuards) {
        if (!model.auth.globalGuards.includes(guard)) model.auth.globalGuards.push(guard);
      }
      for (const field of collectTenantFields(content)) {
        if (!model.auth.tenantFields.includes(field)) model.auth.tenantFields.push(field);
      }
    }
    model.dbModels.push(...parseDatabaseModels(path, content));
    model.infra.ports.push(...collectPorts(path, content));
    model.infra.upstreams.push(...collectUpstreams(path, content));
  }

  for (const [from, deps] of Object.entries(model.imports)) {
    for (const dep of deps) {
      if (!model.files.includes(dep)) continue;
      const reverse = (model.reverseImports[dep] ??= []);
      if (!reverse.includes(from)) reverse.push(from);
    }
  }
  return model;
}
