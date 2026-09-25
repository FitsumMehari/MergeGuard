import test from "node:test";
import assert from "node:assert/strict";
import { runCli, tempRepo, put, commitAll } from "./helpers.js";

test("doctor reports version, verifier, and Laya without secrets", () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root);
  const text = runCli(["doctor"], root);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /MergeGuard\s+0\.1\.0/);
  assert.match(text.stdout, /Configured\s+verifier: offline/);
  assert.match(text.stdout, /Effective\s+verifier: offline/);
  assert.match(text.stdout, /Laya/);
  assert.match(text.stdout, /Jev/);
  assert.doesNotMatch(text.stdout, /TYPESAFE_API_KEY|sk-|ghp_/);
});

test("doctor --json is parseable", () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root);
  const result = runCli(["doctor", "--json"], root);
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.version, "0.1.0");
  assert.equal(json.verifier.configured, "offline");
  assert.equal(json.verifier.effective, "offline");
  assert.equal(typeof json.laya.available, "boolean");
  assert.equal(typeof json.jev.configured, "boolean");
});
