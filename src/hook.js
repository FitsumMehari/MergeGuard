import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { git, repositoryRoot } from "./git.js";

const START = "# >>> mergeguard >>>";
const END = "# <<< mergeguard <<<";

export function hookPath(root) {
  const gitDir = git(["rev-parse", "--git-dir"], { cwd: root }).trim();
  return resolve(root, gitDir, "hooks", "pre-push");
}

export function installHook(cwd = process.cwd(), { force = false } = {}) {
  const root = repositoryRoot(cwd);
  const path = hookPath(root);
  let existing = existsSync(path) ? readFileSync(path, "utf8") : "#!/bin/sh\n\n";
  if (existing.includes(START)) return { path, changed: false, message: "MergeGuard pre-push hook is already installed." };
  if (!existing.startsWith("#!")) {
    if (!force) throw new Error(`Existing pre-push hook has no shebang: ${path}. Use --force to prepend one safely.`);
    existing = `#!/bin/sh\n${existing}`;
  }
  const block = `\n${START}\nROOT="$(git rev-parse --show-toplevel)" || exit 2\ncd "$ROOT" || exit 2\nexport MERGEGUARD_REMOTE="$1"\nif [ -x "$ROOT/node_modules/.bin/mergeguard" ]; then\n  "$ROOT/node_modules/.bin/mergeguard" review --push\nelif command -v mergeguard >/dev/null 2>&1; then\n  mergeguard review --push\nelse\n  npx --no-install mergeguard review --push\nfi\nstatus=$?\nif [ "$status" -ne 0 ]; then exit "$status"; fi\n${END}\n`;
  writeFileSync(path, `${existing.trimEnd()}\n${block}`);
  try { chmodSync(path, 0o755); } catch {}
  return { path, changed: true, message: "MergeGuard pre-push hook installed." };
}

export function uninstallHook(cwd = process.cwd()) {
  const root = repositoryRoot(cwd);
  const path = hookPath(root);
  if (!existsSync(path)) return { path, changed: false, message: "No pre-push hook exists." };
  const existing = readFileSync(path, "utf8");
  if (!existing.includes(START)) return { path, changed: false, message: "MergeGuard is not installed in the pre-push hook." };
  const escapedStart = escapeRegExp(START), escapedEnd = escapeRegExp(END);
  const cleaned = existing.replace(new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "m"), "\n");
  writeFileSync(path, cleaned.trimEnd() + "\n");
  return { path, changed: true, message: "MergeGuard block removed; other pre-push hook content was preserved." };
}

export function hookStatus(cwd = process.cwd()) {
  const root = repositoryRoot(cwd), path = hookPath(root);
  const installed = existsSync(path) && readFileSync(path, "utf8").includes(START);
  return { path, installed };
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
