import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { renderReport, toSarif, toGitLabCodeQuality } from "../src/reporters/index.js";
import { runCli, tempRepo, put, commitAll } from "./helpers.js";

async function unsafeRepo() {
  const root = tempRepo();
  put(root, "a.js", "export const a = 1;\n");
  commitAll(root);
  put(root, "a.js", "export const a = eval(input);\n");
  return { root, result: await review({ cwd: root, noAi: true }) };
}

test("JSON report is stable and parseable", async () => {
  const { result } = await unsafeRepo();
  const json = JSON.parse(renderReport(result, "json"));
  assert.equal(json.version, "0.1.0");
  assert.equal(typeof json.passed, "boolean");
  assert.equal(json.passed, !json.blocking);
  assert.ok(Array.isArray(json.findings));
  assert.ok(json.summary);
  assert.ok(json.metadata);
  assert.ok(json.findings[0].id);
  assert.ok(json.findings[0].detector);
  assert.ok(json.findings[0].severity);
});

test("SARIF 2.1 contains rules, levels, and locations", async () => {
  const { result } = await unsafeRepo();
  const sarif = toSarif(result);
  assert.equal(sarif.version, "2.1.0");
  assert.ok(sarif.runs[0].tool.driver.informationUri.includes("MergeGuard"));
  assert.ok(sarif.runs[0].tool.driver.rules.length > 0);
  const item = sarif.runs[0].results[0];
  assert.ok(item.ruleId);
  assert.equal(item.level, "error");
  assert.ok(item.locations[0].physicalLocation.artifactLocation.uri);
  assert.equal(typeof item.locations[0].physicalLocation.region.startLine, "number");
  assert.ok(item.message.text);
  assert.ok(item.partialFingerprints.mergeguardFindingId);
});

test("GitLab Code Quality uses stable fingerprints", async () => {
  const { result } = await unsafeRepo();
  const first = toGitLabCodeQuality(result);
  const second = toGitLabCodeQuality(result);
  assert.ok(first[0].fingerprint);
  assert.equal(first[0].fingerprint, second[0].fingerprint);
  assert.ok(first[0].location.path);
  assert.ok(first[0].location.lines.begin);
  assert.ok(["blocker", "critical", "major", "minor", "info"].includes(first[0].severity));
});

test("CLI JSON stdout is only JSON", () => {
  const root = tempRepo();
  put(root, "a.js", "export const a = 1;\n");
  commitAll(root);
  put(root, "a.js", "export const a = eval(input);\n");
  const cli = runCli(["review", "--no-ai", "--format", "json"], root);
  assert.equal(cli.status, 1);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.passed, false);
});
