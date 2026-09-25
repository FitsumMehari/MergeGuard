import test from "node:test";
import assert from "node:assert/strict";
import { writeDefaultConfig, loadConfig, normalizeConfig } from "../src/config.js";
import { review } from "../src/review.js";
import { runCli, tempRepo, put, commitAll } from "./helpers.js";

test("no config file uses defaults", () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root);
  const loaded = loadConfig(root);
  assert.equal(loaded.path, undefined);
  assert.equal(loaded.config.failOn, "high");
  assert.equal(loaded.config.verifier, "auto");
});

test("init writes config and refuses to overwrite", () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root);
  const created = runCli(["init"], root);
  assert.equal(created.status, 0);
  const loaded = loadConfig(root);
  assert.match(loaded.path, /\.mergeguard\.yml$/);
  const again = runCli(["init"], root);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /already exists/);
});

test("malformed YAML reports the file and line", () => {
  const root = tempRepo();
  put(root, ".mergeguard.yml", "fail_on high\n");
  assert.throws(() => loadConfig(root), /line 1/);
});

test("unknown keys warn and exclude globs apply", async () => {
  const root = tempRepo();
  put(root, "ok.js", "export const x = 1;\n");
  commitAll(root);
  put(root, "dist/bad.js", "export const x = eval(input);\n");
  put(root, "src/bad.js", "export const x = eval(input);\n");
  put(root, ".mergeguard.yml", "fail_on: high\nexclude:\n  - dist/**\nnot_a_real_key: true\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.warnings.some((w) => /not_a_real_key/.test(w)));
  assert(!result.findings.some((f) => f.file.startsWith("dist/")));
  assert(result.findings.some((f) => f.file === "src/bad.js"));
});

test("fail_on none never blocks", () => {
  const config = normalizeConfig({ fail_on: "none" });
  assert.equal(config.failOn, "none");
});

test("writeDefaultConfig is conservative", () => {
  const root = tempRepo();
  const path = writeDefaultConfig(root);
  const loaded = loadConfig(root);
  assert.equal(loaded.path, path);
  assert.equal(loaded.config.failOn, "high");
  assert.equal(loaded.config.verifier, "auto");
});
