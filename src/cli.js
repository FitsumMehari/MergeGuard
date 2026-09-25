import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { review } from "./review.js";
import { renderReport } from "./reporters/index.js";
import { installHook, uninstallHook, hookStatus } from "./hook.js";
import { githubWorkflow, gitlabWorkflow } from "./ci.js";
import { loadConfig, writeDefaultConfig } from "./config.js";
import { git, gitAvailable, repositoryRoot } from "./git.js";
import { detectLaya } from "./verifiers/index.js";
import { VERSION } from "./version.js";

export async function main(argv) {
  if (!argv.length) argv = ["review"];
  if (argv.includes("--version") || argv[0] === "version") { console.log(`mergeguard ${VERSION}`); return 0; }
  if (argv.includes("--help") || argv[0] === "help") { console.log(help()); return 0; }
  if (argv[0]?.startsWith("-")) argv.unshift("review");
  const [command, ...rest] = argv;
  if (command === "review") return reviewCommand(rest);
  if (command === "hook") return hookCommand(rest);
  if (command === "init") return initCommand(rest);
  if (command === "doctor") return doctorCommand(rest);
  if (command === "ci") return ciCommand(rest);
  throw new Error(`Unknown command '${command}'. Run mergeguard --help.`);
}

async function reviewCommand(args) {
  const opts = parseArgs(args, {
    booleans: new Set(["staged","push","no-ai","verbose","no-color","no-untracked"]),
    values: new Set(["base","head","format","output","fail-on","verifier","config","confidence","max-files","max-candidates"]),
  });
  let pushInput;
  if (opts.push && !process.stdin.isTTY) pushInput = await readStdin();
  const result = await review({
    staged: opts.staged, push: opts.push, pushInput, base: opts.base, head: opts.head,
    verifier: opts.verifier, noAi: opts["no-ai"], failOn: opts["fail-on"], configPath: opts.config,
    confidence: numberOption(opts.confidence), maxFiles: intOption(opts["max-files"]), maxCandidates: intOption(opts["max-candidates"]),
    includeUntracked: !opts["no-untracked"],
  });
  const format = opts.format || "terminal";
  const output = renderReport(result, format, { verbose: opts.verbose, color: !opts["no-color"] && process.stdout.isTTY });
  if (opts.output) {
    writeFileSync(resolve(opts.output), output + (output.endsWith("\n") ? "" : "\n"));
    if (format !== "terminal") {
      console.error(renderReport(result, "terminal", { verbose: opts.verbose, color: false }));
      console.error(`\nMergeGuard wrote ${format} report to ${resolve(opts.output)}`);
    }
  } else console.log(output);
  return result.blocking ? 1 : 0;
}

function hookCommand(args) {
  const action = args[0] || "status";
  const force = args.includes("--force");
  if (action === "install") { const result = installHook(process.cwd(), {force}); console.log(`${result.message}\n${result.path}`); return 0; }
  if (action === "uninstall") { const result = uninstallHook(); console.log(`${result.message}\n${result.path}`); return 0; }
  if (action === "status") { const result = hookStatus(); console.log(result.installed ? `installed: ${result.path}` : `not installed: ${result.path}`); return result.installed ? 0 : 1; }
  throw new Error("Usage: mergeguard hook install|uninstall|status [--force]");
}

function initCommand(args) {
  const root = repositoryRoot();
  const path = writeDefaultConfig(root, { force: args.includes("--force") });
  console.log(`Created ${path}`);
  if (args.includes("--hook")) { const result = installHook(root); console.log(result.message); }
  return 0;
}

function doctorCommand(args) {
  const rows = [];
  rows.push(["Node", process.version, Number(process.versions.node.split(".")[0]) >= 20]);
  rows.push(["Git", gitAvailable() ? git(["--version"]).trim() : "not found", gitAvailable()]);
  let root;
  try { root = repositoryRoot(); rows.push(["Repository", root, true]); } catch (error) { rows.push(["Repository", error.message, false]); }
  if (root) {
    try { const loaded=loadConfig(root); rows.push(["Config", loaded.path || "defaults (no config file)", true]); } catch (error) { rows.push(["Config", error.message, false]); }
  }
  const laya = detectLaya(root ? loadConfig(root).config : {laya:{}});
  rows.push(["Laya", laya.available ? `${laya.version} via ${laya.command}` : "not installed (offline verifier remains available)", true]);
  for (const [name,value,ok] of rows) console.log(`${ok ? "✓" : "✗"} ${name.padEnd(12)} ${value}`);
  return rows.every((row)=>row[2]) ? 0 : 2;
}

function ciCommand(args) {
  const provider = args[0];
  if (provider === "github") { console.log(githubWorkflow()); return 0; }
  if (provider === "gitlab") { console.log(gitlabWorkflow()); return 0; }
  throw new Error("Usage: mergeguard ci github|gitlab");
}

function parseArgs(args, schema) {
  const out = {};
  for (let i=0;i<args.length;i++) {
    const token=args[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument '${token}'`);
    const eq=token.indexOf("=");
    const key=token.slice(2,eq>0?eq:undefined);
    if (schema.booleans.has(key)) { out[key]=true; continue; }
    if (!schema.values.has(key)) throw new Error(`Unknown option '--${key}'`);
    const value=eq>0?token.slice(eq+1):args[++i];
    if (value===undefined || value.startsWith("--")) throw new Error(`Option '--${key}' requires a value`);
    out[key]=value;
  }
  return out;
}
function numberOption(value){if(value===undefined)return undefined;const n=Number(value);if(!Number.isFinite(n)||n<0||n>1)throw new Error("--confidence must be between 0 and 1");return n;}
function intOption(value){if(value===undefined)return undefined;const n=Number(value);if(!Number.isInteger(n)||n<1)throw new Error("numeric limit options must be positive integers");return n;}
async function readStdin(){let text="";for await(const chunk of process.stdin)text+=chunk;return text;}

function help(){return `MergeGuard ${VERSION}\nLocal-first semantic code review gate for Git diffs.\n\nUSAGE\n  mergeguard review [options]\n  mergeguard hook install|uninstall|status\n  mergeguard init [--hook] [--force]\n  mergeguard doctor\n  mergeguard ci github|gitlab\n\nREVIEW SCOPES\n  mergeguard review                     Working tree + staged + untracked vs HEAD\n  mergeguard review --staged            Staged changes only\n  mergeguard review --base main         Branch diff from merge-base(main, HEAD)\n  mergeguard review --base main --head SHA\n  mergeguard review --push              Outgoing commits (normally called by pre-push hook)\n\nOPTIONS\n  --format terminal|json|sarif|gitlab\n  --output FILE\n  --fail-on critical|high|medium|low|info|none\n  --verifier auto|offline|laya|jev\n  --no-ai                               Force deterministic/offline verification\n  --config FILE                         Explicit config path\n  --confidence 0..1\n  --max-files N\n  --max-candidates N\n  --no-untracked\n  --verbose\n  --no-color\n  --version\n\nEXIT CODES\n  0  Review completed; no blocking finding\n  1  Review completed; blocking finding present\n  2  MergeGuard/config/runtime failure\n`;}
