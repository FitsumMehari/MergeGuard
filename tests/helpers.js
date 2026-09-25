import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const cli = fileURLToPath(new URL("../bin/mergeguard.js", import.meta.url));

export function tempDir(prefix = "mergeguard-tmp-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function tempRepo() {
  const root = tempDir("mergeguard-test-");
  run("git", ["init", "-q"], root);
  run("git", ["config", "user.email", "mergeguard@example.test"], root);
  run("git", ["config", "user.name", "MergeGuard Test"], root);
  run("git", ["config", "commit.gpgsign", "false"], root);
  return root;
}

export function put(root, path, content) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export function commitAll(root, message = "baseline") {
  run("git", ["add", "-A"], root);
  run("git", ["commit", "-qm", message], root);
}

export function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
}

export function spawn(command, args, cwd, options = {}) {
  return spawnSync(command, args, { cwd, encoding: "utf8", ...options });
}

export function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

export function installLocalBin(root) {
  const dest = join(root, "node_modules", ".bin");
  mkdirSync(dest, { recursive: true });
  const wrapper = join(dest, "mergeguard");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
  try { chmodSync(wrapper, 0o755); } catch { /* ignore */ }
  return wrapper;
}

export function runCli(args, cwd, options = {}) {
  return spawn(process.execPath, [cli, ...args], cwd, options);
}
