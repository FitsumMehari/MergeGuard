import { loadConfig } from "./config.js";
import { git, gitAvailable, repositoryRoot } from "./git.js";
import { detectLaya, detectPython, resolveVerifier } from "./verifiers/index.js";
import { VERSION } from "./version.js";

export function collectDoctorReport(cwd = process.cwd()) {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  let repository;
  let repositoryOk = true;
  try {
    repository = repositoryRoot(cwd);
  } catch (error) {
    repository = error.message;
    repositoryOk = false;
  }

  let configPath = "defaults (no config file)";
  let configOk = true;
  let config = { verifier: "offline", laya: {} };
  if (repositoryOk) {
    try {
      const loaded = loadConfig(repository);
      config = loaded.config;
      configPath = loaded.path || "defaults (no config file)";
    } catch (error) {
      configOk = false;
      configPath = error.message;
    }
  }

  const python = detectPython(config);
  const laya = detectLaya(config);
  const resolved = resolveVerifier(config);
  const jevConfigured = Boolean(process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY);
  const gitOk = gitAvailable();

  return {
    version: VERSION,
    node: { version: process.version, ok: nodeMajor >= 20 },
    git: { available: gitOk, version: gitOk ? git(["--version"]).trim() : "not found" },
    repository: { ok: repositoryOk, path: repositoryOk ? repository : undefined, error: repositoryOk ? undefined : repository },
    config: { ok: configOk, path: configPath, verifier: config.verifier },
    verifier: resolved,
    python: python.available ? { available: true, version: python.version, command: python.command } : { available: false },
    laya: laya.available
      ? { available: true, version: laya.version, command: laya.command }
      : { available: false },
    jev: { configured: jevConfigured },
    ok: nodeMajor >= 20 && gitOk && repositoryOk && configOk,
  };
}

export function formatDoctorReport(report) {
  const lines = [];
  const mark = (ok) => (ok ? "✓" : "✗");
  lines.push(`${mark(true)} MergeGuard   ${report.version}`);
  lines.push(`${mark(report.node.ok)} Node         ${report.node.version}`);
  lines.push(`${mark(report.git.available)} Git          ${report.git.version}`);
  lines.push(`${mark(report.repository.ok)} Repository   ${report.repository.ok ? report.repository.path : report.repository.error}`);
  lines.push(`${mark(report.config.ok)} Config       ${report.config.path}`);
  lines.push(`${mark(true)} Configured   verifier: ${report.verifier.configured}`);
  lines.push(`${mark(true)} Effective    verifier: ${report.verifier.effective}`);
  if (report.verifier.configured === "auto") {
    lines.push(`  Reason: ${report.verifier.reason}`);
  }
  lines.push(`${mark(report.python.available)} Python       ${report.python.available ? report.python.version : "not found (needed only for --verifier laya)"}`);
  lines.push(`${mark(true)} Laya         ${report.laya.available ? `${report.laya.version} via ${report.laya.command}` : "not installed (offline verifier remains available)"}`);
  lines.push(`${mark(true)} Jev          ${report.jev.configured ? "credentials present in environment" : "not configured"}`);
  return lines.join("\n");
}
