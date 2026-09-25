import test from "node:test";
import assert from "node:assert/strict";
import { patternCandidates } from "../src/detectors/patterns.js";
import { review } from "../src/review.js";
import { tempRepo, put, commitAll } from "./helpers.js";

function added(path, content) {
  const lines = content.split("\n");
  return {
    path,
    status: "modified",
    patch: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,0 +1,${lines.length} @@\n${lines.map((x) => `+${x}`).join("\n")}`,
    headContent: content,
  };
}

test("safe YAML loaders are not reported", () => {
  const found = patternCandidates([
    added("a.py", "data = yaml.load(raw, Loader=yaml.SafeLoader)\n"),
    added("b.py", "data = yaml.safe_load(raw)\n"),
  ]);
  assert(!found.some((item) => item.detector === "python-yaml-load"));
});

test("unsafe yaml.load is reported", () => {
  const found = patternCandidates([added("a.py", "data = yaml.load(raw)\n")]);
  assert(found.some((item) => item.detector === "python-yaml-load"));
});

test("jwt.decode after jwt.verify is not reported", () => {
  const found = patternCandidates([added("a.js", "const payload = jwt.verify(token, secret);\nconst claims = jwt.decode(token);\n")]);
  assert(!found.some((item) => item.detector === "jwt-decode-only"));
});

test("parameterized SQL is not reported as injection", () => {
  const found = patternCandidates([added("a.js", "await db.query('SELECT * FROM users WHERE id = $1', [id]);\n")]);
  assert(!found.some((item) => item.detector === "unsafe-sql"));
});

test("spawn with an argument array is not command injection", () => {
  const found = patternCandidates([added("a.js", "execFile('git', ['status'], { shell: false });\n")]);
  assert(!found.some((item) => item.detector === "js-shell-interpolation"));
});

test("requests.get without verify=False is not a TLS finding", async () => {
  const root = tempRepo();
  put(root, "main.py", "import requests\ndef get(url):\n    return requests.get(url)\n");
  commitAll(root);
  put(root, "main.py", "import requests\ndef get(url):\n    return requests.get(url, timeout=5)\n");
  const result = await review({ cwd: root, noAi: true });
  assert(!result.findings.some((f) => f.detector === "tls-disabled"));
});

test("style-only edits produce no findings", async () => {
  const root = tempRepo();
  put(root, "a.js", "export const x=1;\n");
  commitAll(root);
  put(root, "a.js", "export const x = 1;\n");
  const result = await review({ cwd: root, noAi: true });
  assert.equal(result.findings.length, 0);
});
