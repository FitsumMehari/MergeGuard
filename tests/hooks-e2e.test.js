import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installHook, uninstallHook, hookStatus, hookPath } from "../src/hook.js";
import { hooksDirectory } from "../src/git.js";
import { commitAll, installLocalBin, put, read, run, spawn, tempDir, tempRepo } from "./helpers.js";

test("hook install is idempotent and preserves existing content", () => {
  const root = tempRepo();
  put(root, "README.md", "x\n");
  commitAll(root);
  const path = hookPath(root);
  writeFileSync(path, "#!/bin/sh\necho existing-check\n");
  chmodSync(path, 0o755);
  const first = installHook(root);
  const second = installHook(root);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  const text = read(root, path.slice(root.length + 1));
  assert.equal(text.split("# >>> mergeguard >>>").length - 1, 1);
  assert(text.includes("existing-check"));
  assert(!text.includes("npx --yes --package mergeguard"));
  uninstallHook(root);
  const after = read(root, path.slice(root.length + 1));
  assert(after.includes("existing-check"));
  assert(!after.includes("# >>> mergeguard >>>"));
  assert.equal(hookStatus(root).installed, false);
});

test("hook respects core.hooksPath", () => {
  const root = tempRepo();
  put(root, "README.md", "x\n");
  commitAll(root);
  const custom = join(root, "custom-hooks");
  mkdirSync(custom, { recursive: true });
  run("git", ["config", "core.hooksPath", "custom-hooks"], root);
  assert.equal(hooksDirectory(root), custom);
  installHook(root);
  assert.equal(hookStatus(root).installed, true);
  assert(hookPath(root).endsWith(join("custom-hooks", "pre-push")));
});

test("real pre-push blocks an unsafe commit and allows a clean follow-up", () => {
  const root = tempRepo();
  put(root, "app.py", "def ok():\n    return 1\n");
  commitAll(root, "safe");
  run("git", ["branch", "-M", "main"], root);
  installLocalBin(root);
  installHook(root);

  const bare = tempDir("mergeguard-bare-");
  run("git", ["init", "-q", "--bare"], bare);
  run("git", ["remote", "add", "origin", bare], root);

  put(root, "app.py", "import requests\ndef get(url):\n    return requests.get(url, verify=False)\n");
  commitAll(root, "unsafe");
  const blocked = spawn("git", ["push", "-u", "origin", "main"], root);
  assert.notEqual(blocked.status, 0);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /TLS certificate verification disabled|blocked this push/i);

  put(root, "app.py", "import requests\ndef get(url):\n    return requests.get(url, timeout=5)\n");
  commitAll(root, "fix");
  const allowed = spawn("git", ["push", "origin", "main"], root);
  assert.equal(allowed.status, 0, allowed.stderr);
});
