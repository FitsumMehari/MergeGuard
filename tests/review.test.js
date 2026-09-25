import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { renderReport, toSarif, toGitLabCodeQuality } from "../src/reporters/index.js";
import { tempRepo, put, commitAll, run } from "./helpers.js";

test("working tree review catches a check-then-create race and blocks", async()=>{
  const root=tempRepo();
  put(root,"app.js",`export async function register(db,email){ return db.user.create({data:{email}}) }\n`); commitAll(root);
  put(root,"app.js",`export async function register(db,email){\n const user=await db.user.findUnique({where:{email}});\n if(!user) return db.user.create({data:{email}});\n}\n`);
  const result=await review({cwd:root,noAi:true});
  assert.equal(result.blocking,true);
  assert(result.findings.some((f)=>f.detector==="check-then-create"));
  assert.equal(result.verifier,"offline");
});

test("Python repository gets language-independent security detection", async()=>{
  const root=tempRepo();
  put(root,"main.py",`import requests\ndef get(url):\n    return requests.get(url)\n`); commitAll(root);
  put(root,"main.py",`import requests\ndef get(url):\n    return requests.get(url, verify=False)\n`);
  const result=await review({cwd:root,noAi:true});
  assert(result.findings.some((f)=>f.detector==="tls-disabled" && f.severity==="critical"));
});

test("removed tenant filter is treated as a critical regression", async()=>{
  const root=tempRepo();
  put(root,"orders.ts",`export const get=(db,id,tenantId)=>db.order.findFirst({where:{id,tenantId}});\n`); commitAll(root);
  put(root,"orders.ts",`export const get=(db,id,tenantId)=>db.order.findFirst({where:{id}});\n`);
  const result=await review({cwd:root,noAi:true});
  assert(result.findings.some((f)=>f.detector==="tenant-filter-removed" && f.severity==="critical"));
});

test("staged scope excludes later unstaged edits", async()=>{
  const root=tempRepo();
  put(root,"app.js","export const x=1;\n"); commitAll(root);
  put(root,"app.js",`export async function x(db,email){ const v=await db.user.findUnique({where:{email}}); if(!v) return db.user.create({data:{email}}); }\n`);
  run("git",["add","app.js"],root);
  put(root,"app.js","export const safe=2;\n");
  const staged=await review({cwd:root,staged:true,noAi:true});
  const working=await review({cwd:root,noAi:true});
  assert(staged.findings.some((f)=>f.detector==="check-then-create"));
  assert(!working.findings.some((f)=>f.detector==="check-then-create"));
});

test("SARIF and GitLab output contain locations and fingerprints", async()=>{
  const root=tempRepo(); put(root,"a.js","export const a=1;\n"); commitAll(root); put(root,"a.js","export const a=eval(input);\n");
  const result=await review({cwd:root,noAi:true});
  const sarif=toSarif(result), gitlab=toGitLabCodeQuality(result);
  assert.equal(sarif.version,"2.1.0");
  assert(sarif.runs[0].results.length>0);
  assert(gitlab[0].fingerprint);
  assert.doesNotThrow(()=>JSON.parse(renderReport(result,"json")));
});
