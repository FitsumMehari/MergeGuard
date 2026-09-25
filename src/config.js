import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CATEGORIES, SEVERITIES, parseSimpleYaml } from "./utils.js";

export const defaultConfig = Object.freeze({
  version: 1,
  failOn: "high",
  verifier: "auto",
  confidence: 0.62,
  maxFiles: 300,
  maxCandidates: 120,
  contextFiles: 24,
  contextChars: 18_000,
  ignore: [
    "node_modules/**", "vendor/**", "dist/**", "build/**", "coverage/**", ".next/**", ".git/**",
    "**/*.min.js", "**/*.map", "**/generated/**", "**/fixtures/**", "**/snapshots/**",
  ],
  categories: Object.fromEntries(CATEGORIES.map((category) => [category, true])),
  laya: { python: undefined, model: undefined, maxLen: 4096 },
  jev: { url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" },
});

export function loadConfig(root, explicitPath) {
  const candidates = explicitPath
    ? [resolve(root, explicitPath)]
    : [resolve(root, ".mergeguard.yml"), resolve(root, ".mergeguard.yaml"), resolve(root, ".mergeguard.json")];
  const path = candidates.find(existsSync);
  if (!path) return { config: structuredClone(defaultConfig), path: undefined };
  let parsed;
  const text = readFileSync(path, "utf8");
  try {
    parsed = path.endsWith(".json") ? JSON.parse(text) : parseSimpleYaml(text);
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error.message}`);
  }
  return { config: normalizeConfig(parsed), path };
}

export function normalizeConfig(input = {}) {
  const config = structuredClone(defaultConfig);
  if (input.fail_on !== undefined || input.failOn !== undefined) {
    const failOn = String(input.fail_on ?? input.failOn).toLowerCase();
    if (![...SEVERITIES, "none"].includes(failOn)) throw new Error(`fail_on must be one of: ${[...SEVERITIES, "none"].join(", ")}`);
    config.failOn = failOn;
  }
  if (input.verifier !== undefined) {
    const verifier = typeof input.verifier === "object" ? input.verifier.engine : input.verifier;
    if (verifier && !["auto", "offline", "laya", "jev"].includes(verifier)) throw new Error("verifier must be auto, offline, laya, or jev");
    if (verifier) config.verifier = verifier;
  }
  if (input.confidence !== undefined) {
    const value = Number(typeof input.confidence === "object" ? input.confidence.report : input.confidence);
    if (Number.isFinite(value) && value >= 0 && value <= 1) config.confidence = value;
  }
  const maxFiles = Number(input.max_files ?? input.maxFiles);
  if (Number.isInteger(maxFiles) && maxFiles > 0) config.maxFiles = Math.min(maxFiles, 5000);
  const maxCandidates = Number(input.max_candidates ?? input.maxCandidates);
  if (Number.isInteger(maxCandidates) && maxCandidates > 0) config.maxCandidates = Math.min(maxCandidates, 1000);
  const contextFiles = Number(input.context_files ?? input.contextFiles);
  if (Number.isInteger(contextFiles) && contextFiles > 0) config.contextFiles = Math.min(contextFiles, 100);
  const contextChars = Number(input.context_chars ?? input.contextChars);
  if (Number.isInteger(contextChars) && contextChars > 0) config.contextChars = Math.min(contextChars, 200_000);

  const ignore = input.ignore?.paths ?? input.ignore;
  if (Array.isArray(ignore)) config.ignore = ignore.filter((x) => typeof x === "string" && x.trim());

  const review = input.review ?? input.categories;
  if (review && typeof review === "object") {
    for (const category of CATEGORIES) {
      if (typeof review[category] === "boolean") config.categories[category] = review[category];
    }
  }

  if (input.laya && typeof input.laya === "object") {
    if (input.laya.python) config.laya.python = String(input.laya.python);
    if (input.laya.model) config.laya.model = String(input.laya.model);
    const maxLen = Number(input.laya.max_len ?? input.laya.maxLen);
    if (Number.isInteger(maxLen) && maxLen >= 256) config.laya.maxLen = Math.min(maxLen, 8192);
  }
  if (input.jev && typeof input.jev === "object") {
    if (input.jev.url) config.jev.url = String(input.jev.url);
    if (input.jev.model) config.jev.model = String(input.jev.model);
  }
  return config;
}

export function writeDefaultConfig(root, { force = false } = {}) {
  const path = resolve(root, ".mergeguard.yml");
  if (existsSync(path) && !force) throw new Error(`${path} already exists (use --force to replace it)`);
  const text = `# MergeGuard configuration\nversion: 1\nfail_on: high\nverifier:\n  engine: auto\n\nconfidence: 0.62\n\nignore:\n  paths:\n    - node_modules/**\n    - vendor/**\n    - dist/**\n    - build/**\n    - coverage/**\n    - generated/**\n\nreview:\n  correctness: true\n  security: true\n  concurrency: true\n  database: true\n  authorization: true\n  tenant-isolation: true\n  reliability: true\n  performance: true\n  api: true\n`;
  writeFileSync(path, text);
  return path;
}
