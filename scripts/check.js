#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith(".js")) acc.push(full);
  }
  return acc;
}

const files = [join(rootPath, "bin", "mergeguard.js"), join(rootPath, "scripts", "check.js"), ...walk(join(rootPath, "src"))];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `syntax check failed: ${file}\n`);
    process.exit(2);
  }
}

const tests = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...walk(join(rootPath, "tests")).filter((file) => file.endsWith(".test.js"))], {
  cwd: rootPath,
  stdio: "inherit",
});
process.exit(tests.status ?? 2);
