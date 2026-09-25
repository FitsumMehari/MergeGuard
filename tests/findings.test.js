import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { tempRepo, put, commitAll } from "./helpers.js";

test("async forEach is a high-severity correctness finding", async () => {
  const root = tempRepo();
  put(root, "a.js", "export async function run(items){ for (const item of items) await save(item); }\n");
  commitAll(root);
  put(root, "a.js", "export async function run(items){ items.forEach(async (item) => { await save(item); }); }\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.findings.some((f) => f.detector === "async-foreach"));
});

test("unbounded deleteMany is critical", async () => {
  const root = tempRepo();
  put(root, "a.js", "export const wipe = (db) => db.user.deleteMany({ where: { id } });\n");
  commitAll(root);
  put(root, "a.js", "export const wipe = (db) => db.user.deleteMany();\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.findings.some((f) => f.detector === "unbounded-delete" && f.severity === "critical"));
});

test("removed auth guard is reported", async () => {
  const root = tempRepo();
  put(root, "ctrl.ts", "@UseGuards(AuthGuard)\n@Post('/pay')\nexport function pay() {}\n");
  commitAll(root);
  put(root, "ctrl.ts", "@Post('/pay')\nexport function pay() {}\n");
  const result = await review({ cwd: root, noAi: true });
  assert(result.findings.some((f) => f.detector === "auth-protection-removed"));
});
