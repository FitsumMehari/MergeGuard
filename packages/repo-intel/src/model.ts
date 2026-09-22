import type { PathAlias } from "./paths.js";

export type { PathAlias };

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
  isPublic?: boolean;
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
    globalGuards: string[];
    tenantFields: string[];
  };
  pathAliases: PathAlias[];
  infra: {
    dockerfiles: string[];
    composeFiles: string[];
    nginxFiles: string[];
    ports: Array<{ file: string; port: number; kind: string }>;
    upstreams: Array<{ file: string; target: string }>;
  };
  files: string[];
}
