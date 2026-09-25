import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, tempRepo, put, commitAll } from "./helpers.js";

test("no args and --help print usage", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /USAGE/);
  const empty = runCli([]);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /USAGE/);
});

test("--version prints 0.1.0", () => {
  const result = runCli(["--version"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /mergeguard 0\.1\.0/);
});

test("invalid option exits 2 without a stack", () => {
  const result = runCli(["review", "--not-a-real-flag"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
  assert.doesNotMatch(result.stderr, /at main/);
});

test("unknown command exits 2", () => {
  const result = runCli(["explode"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command/);
});

test("nonexistent Git repository exits 2", () => {
  const cwd = mkdtempSync(join(tmpdir(), "mergeguard-nogit-"));
  const result = runCli(["review", "--no-ai"], cwd);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Not inside a Git repository/);
});

test("empty diff exits 0", () => {
  const root = tempRepo();
  put(root, "ok.js", "export const x = 1;\n");
  commitAll(root);
  const result = runCli(["review", "--no-ai", "--no-color"], root);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No reportable issues|PASS/);
});

test("machine formats keep stdout parseable", () => {
  const root = tempRepo();
  put(root, "ok.js", "export const x = 1;\n");
  commitAll(root);
  const json = runCli(["review", "--no-ai", "--format", "json"], root);
  assert.equal(json.status, 0);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.passed, true);
  assert.equal(Array.isArray(parsed.findings), true);
  assert.match(json.stderr, /MergeGuard:/);
});
