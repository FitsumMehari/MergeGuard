import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { review } from "./review.js";
import { renderReport } from "./reporters/index.js";
import { installHook, uninstallHook, hookStatus } from "./hook.js";
import { githubWorkflow, gitlabWorkflow } from "./ci.js";
import { loadConfig, writeDefaultConfig } from "./config.js";
import { git, gitAvailable, repositoryRoot } from "./git.js";
import { detectLaya } from "./verifiers/index.js";
import { VERSION } from "./version.js";

const MACHINE_FORMATS = new Set(["json", "sarif", "gitlab"]);

export async function main(argv) {
  const args = [...argv];
  if (args.includes("--version") || args[0] === "version") {
    console.log(`mergeguard ${VERSION}`);
    return 0;
  }
  if (args.includes("--help") || args[0] === "help" || args.length === 0) {
    console.log(help());
    return 0;
  }
  if (args[0]?.startsWith("-")) args.unshift("review");
  const [command, ...rest] = args;
  if (command === "review") return reviewCommand(rest);
  if (command === "hook") return hookCommand(rest);
  if (command === "init") return initCommand(rest);
  if (command === "doctor") return doctorCommand();
  if (command === "ci") return ciCommand(rest);
  throw new Error(`Unknown command '${command}'. Run mergeguard --help.`);
}

async function reviewCommand(args) {
  const opts = parseArgs(args, {
    booleans: new Set(["staged", "push", "no-ai", "verbose", "no-color", "no-untracked"]),
    values: new Set(["base", "head", "format", "output", "fail-on", "verifier", "config", "confidence", "max-files", "max-candidates"]),
  });
  const format = opts.format || "terminal";
  if (!["terminal", "json", "sarif", "gitlab"].includes(format)) {
    throw new Error(`Unknown output format '${format}'. Use terminal, json, sarif, or gitlab.`);
  }
  let pushInput;
  if (opts.push && !process.stdin.isTTY) pushInput = await readStdin();
  const result = await review({
    staged: opts.staged,
    push: opts.push,
    pushInput,
    base: opts.base,
    head: opts.head,
    verifier: opts.verifier === "deterministic" ? "offline" : opts.verifier,
    noAi: opts["no-ai"],
    failOn: opts["fail-on"],
    configPath: opts.config,
    confidence: numberOption(opts.confidence),
    maxFiles: intOption(opts["max-files"]),
    maxCandidates: intOption(opts["max-candidates"]),
    includeUntracked: !opts["no-untracked"],
  });
  const color = !opts["no-color"] && process.stdout.isTTY && format === "terminal";
  const output = renderReport(result, format, { verbose: opts.verbose, color });
  if (MACHINE_FORMATS.has(format)) process.stderr.write(`${briefStatus(result)}\n`);
  if (opts.output) {
    const dest = resolve(opts.output);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, output.endsWith("\n") ? output : `${output}\n`);
    if (MACHINE_FORMATS.has(format)) process.stderr.write(`MergeGuard wrote ${format} report to ${dest}\n`);
    else process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  } else {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  return result.blocking ? 1 : 0;
}

function briefStatus(result) {
  const counts = ["critical", "high", "medium", "low", "info"].filter((s) => result.summary[s]).map((s) => `${result.summary[s]} ${s}`);
  const body = counts.length ? counts.join(", ") : "no reportable findings";
  return `MergeGuard: ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} (${body}) — ${result.passed ? "PASS" : "BLOCKED"}`;
}

function hookCommand(args) {
  const action = args[0] || "status";
  const force = args.includes("--force");
  if (action === "install") {
    const result = installHook(process.cwd(), { force });
    console.log(`${result.message}\n${result.path}`);
    return 0;
  }
  if (action === "uninstall") {
    const result = uninstallHook();
    console.log(`${result.message}\n${result.path}`);
    return 0;
  }
  if (action === "status") {
    const result = hookStatus();
    console.log(result.installed ? `installed: ${result.path}` : `not installed: ${result.path}`);
    return 0;
  }
  throw new Error("Usage: mergeguard hook install|uninstall|status [--force]");
}

function initCommand(args) {
  let root;
  try { root = repositoryRoot(); } catch { root = process.cwd(); }
  const path = writeDefaultConfig(root, { force: args.includes("--force") });
  console.log(`Created ${path}`);
  if (args.includes("--hook")) {
    const result = installHook(root);
    console.log(result.message);
  }
  return 0;
}

function doctorCommand() {
  const rows = [];
  rows.push(["Node", process.version, Number(process.versions.node.split(".")[0]) >= 20]);
  rows.push(["Git", gitAvailable() ? git(["--version"]).trim() : "not found", gitAvailable()]);
  let root;
  try {
    root = repositoryRoot();
    rows.push(["Repository", root, true]);
  } catch (error) {
    rows.push(["Repository", error.message, false]);
  }
  if (root) {
    try {
      const loaded = loadConfig(root);
      rows.push(["Config", loaded.path || "defaults (no config file)", true]);
    } catch (error) {
      rows.push(["Config", error.message, false]);
    }
  }
  const laya = detectLaya(root ? loadConfig(root).config : { laya: {} });
  rows.push(["Laya", laya.available ? `${laya.version} via ${laya.command}` : "not installed (offline verifier remains available)", true]);
  for (const [name, value, ok] of rows) console.log(`${ok ? "✓" : "✗"} ${name.padEnd(12)} ${value}`);
  return rows.every((row) => row[2]) ? 0 : 2;
}

function ciCommand(args) {
  const provider = args[0];
  const write = args.includes("--write");
  const force = args.includes("--force");
  let text;
  let dest;
  if (provider === "github") {
    text = githubWorkflow();
    dest = ".github/workflows/mergeguard.yml";
  } else if (provider === "gitlab") {
    text = gitlabWorkflow();
    dest = ".gitlab-ci.mergeguard.yml";
  } else {
    throw new Error("Usage: mergeguard ci github|gitlab [--write] [--force]");
  }
  if (!write) {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    return 0;
  }
  const root = repositoryRoot();
  const path = resolve(root, dest);
  if (existsSync(path) && !force) throw new Error(`${path} already exists (use --force to replace it)`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
  console.log(`Wrote ${path}`);
  return 0;
}

function parseArgs(args, schema) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument '${token}'`);
    const eq = token.indexOf("=");
    const key = token.slice(2, eq > 0 ? eq : undefined);
    if (schema.booleans.has(key)) {
      out[key] = true;
      continue;
    }
    if (!schema.values.has(key)) throw new Error(`Unknown option '--${key}'`);
    const value = eq > 0 ? token.slice(eq + 1) : args[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`Option '--${key}' requires a value`);
    out[key] = value;
  }
  return out;
}

function numberOption(value) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error("--confidence must be between 0 and 1");
  return n;
}

function intOption(value) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error("numeric limit options must be positive integers");
  return n;
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

function help() {
  return `MergeGuard ${VERSION}
Local-first semantic code-change gate for Git diffs.

USAGE
  mergeguard review [options]
  mergeguard hook install|uninstall|status
  mergeguard init [--hook] [--force]
  mergeguard doctor
  mergeguard ci github|gitlab [--write] [--force]

REVIEW SCOPES
  mergeguard review                     Working tree + staged + untracked vs HEAD
  mergeguard review --staged            Staged changes only
  mergeguard review --base main         Branch diff from merge-base(main, HEAD)
  mergeguard review --base main --head SHA
  mergeguard review --push              Outgoing commits (normally called by pre-push hook)

OPTIONS
  --format terminal|json|sarif|gitlab  (machine formats stay parseable on stdout)
  --output FILE
  --fail-on critical|high|medium|low|info|none
  --verifier auto|offline|deterministic|laya|jev
  --no-ai                               Force deterministic/offline verification
  --config FILE                         Explicit config path
  --confidence 0..1
  --max-files N
  --max-candidates N
  --no-untracked
  --verbose
  --no-color
  --version

EXIT CODES
  0  Review completed; no blocking finding
  1  Review completed; blocking finding present
  2  MergeGuard/config/runtime failure
`;
}
