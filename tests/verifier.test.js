import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { detectLaya } from "../src/verifiers/laya.js";
import { verifyCandidates } from "../src/verifiers/index.js";
import { defaultConfig } from "../src/config.js";
import { runCli, tempRepo, put, commitAll } from "./helpers.js";

function unsafeRepo() {
  const root = tempRepo();
  put(root, "a.py", "def x():\n    return 1\n");
  commitAll(root);
  put(root, "a.py", "import requests\ndef x(url):\n    return requests.get(url, verify=False)\n");
  return root;
}

test("deterministic / offline verifier reports TLS findings", async () => {
  const root = unsafeRepo();
  const result = await review({ cwd: root, verifier: "deterministic" });
  assert.equal(result.verifier, "offline");
  assert(result.findings.some((f) => f.detector === "tls-disabled"));
});

test("auto falls back to offline when Laya is missing", async () => {
  const root = unsafeRepo();
  const result = await review({ cwd: root, verifier: "auto" });
  if (!detectLaya({ laya: {} }).available) {
    assert.equal(result.verifier, "offline");
  }
  assert(result.findings.length >= 1);
});

test("explicit laya fails clearly when unavailable", async (t) => {
  if (detectLaya({ laya: {} }).available) {
    t.skip("Laya is installed; unavailable-path test does not apply");
    return;
  }
  const root = unsafeRepo();
  const cli = runCli(["review", "--verifier", "laya"], root);
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /Laya is not installed/);
});

test("offline verifier can suppress a low-confidence candidate", async () => {
  const config = { ...defaultConfig, confidence: 0.99, verifier: "offline" };
  const { findings, provider } = await verifyCandidates(
    [{ detector: "floating-promise", category: "reliability", severity: "low", reviewerConfidence: 0.2, title: "x", file: "a.js" }],
    () => ({ repository: { protections: {} }, files: [] }),
    config,
  );
  assert.equal(provider, "offline");
  assert.equal(findings.length, 0);
});
