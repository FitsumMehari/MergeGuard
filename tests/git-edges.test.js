import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { review } from "../src/review.js";
import { EMPTY_TREE, resolveReviewScope } from "../src/git.js";
import { tempRepo, put, commitAll, run } from "./helpers.js";

test("working tree includes untracked files", async () => {
  const root = tempRepo();
  put(root, "keep.js", "export const x = 1;\n");
  commitAll(root);
  put(root, "new.py", "import requests\nrequests.get(url, verify=False)\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.findings.some((f) => f.detector === "tls-disabled"));
});

test("deleted files are visible in the change set without crashing", async () => {
  const root = tempRepo();
  put(root, "gone.js", "export const x = 1;\n");
  commitAll(root);
  run("git", ["rm", "-q", "gone.js"], root);
  const result = await review({ cwd: root, staged: true, noAi: true });
  assert.equal(result.metadata.filesReviewed >= 1, true);
  assert.equal(result.passed, true);
});

test("renamed files are reviewed at the new path", async () => {
  const root = tempRepo();
  put(root, "old.js", "export const x = 1;\n");
  commitAll(root);
  run("git", ["mv", "old.js", "renamed.js"], root);
  put(root, "renamed.js", "export const x = eval(input);\n");
  run("git", ["add", "renamed.js"], root);
  const result = await review({ cwd: root, staged: true, noAi: true });
  assert(result.findings.some((f) => f.file === "renamed.js" && f.detector === "dynamic-eval"));
});

test("filenames with spaces are reviewed", async () => {
  const root = tempRepo();
  put(root, "safe file.js", "export const x = 1;\n");
  commitAll(root);
  put(root, "safe file.js", "export const x = eval(input);\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.findings.some((f) => f.file === "safe file.js"));
});

test("binary files do not crash the review", async () => {
  const root = tempRepo();
  put(root, "note.txt", "ok\n");
  commitAll(root);
  writeFileSync(join(root, "blob.bin"), Buffer.from([0, 1, 2, 255, 0, 9]));
  const result = await review({ cwd: root, noAi: true });
  assert.equal(typeof result.passed, "boolean");
});

test("detached HEAD reviews the working tree", async () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root);
  run("git", ["checkout", "--detach", "-q"], root);
  put(root, "a.js", "export const x = eval(input);\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.findings.some((f) => f.detector === "dynamic-eval"));
  assert.equal(result.repository.branch, "detached");
});

test("root / single-commit repository can use empty-tree push scope", () => {
  const root = tempRepo();
  put(root, "first.js", "export const x = 1;\n");
  commitAll(root, "first");
  const local = run("git", ["rev-parse", "HEAD"], root).trim();
  const scope = resolveReviewScope(root, { push: true, pushInput: `refs/heads/main ${local} refs/heads/main ${"0".repeat(40)}\n` });
  assert.equal(scope.baseRef, EMPTY_TREE);
  assert.equal(scope.headRef, local);
});

test("multi-commit push range uses the remote SHA as base", async () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root, "one");
  const remote = run("git", ["rev-parse", "HEAD"], root).trim();
  put(root, "a.js", "export const x = 2;\n");
  commitAll(root, "two");
  put(root, "a.js", "export const x = eval(input);\n");
  commitAll(root, "three");
  const local = run("git", ["rev-parse", "HEAD"], root).trim();
  const result = await review({ cwd: root, push: true, pushInput: `refs/heads/main ${local} refs/heads/main ${remote}\n`, noAi: true });
  assert(result.findings.some((f) => f.detector === "dynamic-eval"));
});

test("merge commit review does not crash", async () => {
  const root = tempRepo();
  put(root, "a.js", "export const x = 1;\n");
  commitAll(root, "base");
  run("git", ["branch", "-M", "main"], root);
  run("git", ["checkout", "-qb", "feature"], root);
  put(root, "a.js", "export const x = eval(input);\n");
  commitAll(root, "feature");
  run("git", ["checkout", "-q", "main"], root);
  put(root, "b.js", "export const y = 2;\n");
  commitAll(root, "mainline");
  run("git", ["merge", "-q", "--no-ff", "-m", "merge", "feature"], root);
  const result = await review({ cwd: root, base: "main", head: "HEAD", noAi: true });
  assert.equal(typeof result.passed, "boolean");
});
