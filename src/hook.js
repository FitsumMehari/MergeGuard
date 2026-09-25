import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hooksDirectory, repositoryRoot } from "./git.js";
import { installSpec } from "./package-meta.js";

const START = "# >>> mergeguard >>>";
const END = "# <<< mergeguard <<<";

export function hookPath(root) {
  return join(hooksDirectory(root), "pre-push");
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
  const pkg = installSpec();
  const block = `
${START}
# MergeGuard reviews the outgoing push range. Bypass with: git push --no-verify
input=$(cat)
ROOT="$(git rev-parse --show-toplevel </dev/null)" || exit 2
cd "$ROOT" || exit 2
export MERGEGUARD_REMOTE="$1"
run_mergeguard() {
  if [ -n "$MERGEGUARD_BIN" ]; then
    "$MERGEGUARD_BIN" review --push
  elif [ -x "$ROOT/node_modules/.bin/mergeguard" ]; then
    "$ROOT/node_modules/.bin/mergeguard" review --push
  elif command -v mergeguard >/dev/null 2>&1; then
    mergeguard review --push
  else
    echo "MergeGuard is not installed in this repository." >&2
    echo "Install with: npm install -D ${pkg}" >&2
    echo "Do not install the unscoped npm name mergeguard (different package)." >&2
    echo "Or set MERGEGUARD_BIN to the mergeguard executable." >&2
    exit 2
  fi
}
printf '%s\\n' "$input" | run_mergeguard
status=$?
if [ "$status" -eq 1 ]; then
  echo "MergeGuard blocked this push. Fix the findings, or bypass with: git push --no-verify" >&2
  exit 1
fi
if [ "$status" -ne 0 ]; then exit "$status"; fi
${END}
`;
  writeFileSync(path, `${existing.trimEnd()}\n${block}`);
  try { chmodSync(path, 0o755); } catch { /* Windows may lack POSIX chmod */ }
  return { path, changed: true, message: "MergeGuard pre-push hook installed." };
}

export function uninstallHook(cwd = process.cwd()) {
  const root = repositoryRoot(cwd);
  const path = hookPath(root);
  if (!existsSync(path)) return { path, changed: false, message: "No pre-push hook exists." };
  const existing = readFileSync(path, "utf8");
  if (!existing.includes(START)) return { path, changed: false, message: "MergeGuard is not installed in the pre-push hook." };
  const cleaned = existing.replace(new RegExp(`\\n?${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, "m"), "\n");
  writeFileSync(path, `${cleaned.trimEnd()}\n`);
  return { path, changed: true, message: "MergeGuard block removed; other pre-push hook content was preserved." };
}

export function hookStatus(cwd = process.cwd()) {
  const root = repositoryRoot(cwd);
  const path = hookPath(root);
  const installed = existsSync(path) && readFileSync(path, "utf8").includes(START);
  return { path, installed };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
