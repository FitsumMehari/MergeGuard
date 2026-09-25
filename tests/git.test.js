import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { resolveReviewScope } from "../src/git.js";
import { tempRepo, put, commitAll, run } from "./helpers.js";

test("new repository with no commits can be reviewed", async()=>{
  const root=tempRepo();
  put(root,"main.py","import requests\nrequests.get(url, verify=False)\n");
  const result=await review({cwd:root,noAi:true});
  assert(result.findings.some((f)=>f.detector==="tls-disabled"));
});

test("base/head range reviews feature changes", async()=>{
  const root=tempRepo();
  put(root,"app.js","export const x=1;\n"); commitAll(root,"base");
  run("git",["branch","-M","main"],root);
  run("git",["checkout","-qb","feature"],root);
  put(root,"app.js","export const x = eval(input);\n"); commitAll(root,"feature");
  const result=await review({cwd:root,base:"main",head:"HEAD",noAi:true});
  assert(result.findings.some((f)=>f.detector==="dynamic-eval"));
});

test("pre-push scope honors Git-provided remote/local SHAs",()=>{
  const root=tempRepo();
  put(root,"a.txt","a\n"); commitAll(root,"base");
  const remote=run("git",["rev-parse","HEAD"],root).trim();
  put(root,"a.txt","b\n"); commitAll(root,"next");
  const local=run("git",["rev-parse","HEAD"],root).trim();
  const scope=resolveReviewScope(root,{push:true,pushInput:`refs/heads/main ${local} refs/heads/main ${remote}\n`});
  assert.equal(scope.mode,"push");
  assert.equal(scope.baseRef,remote);
  assert.equal(scope.headRef,local);
});


test("initial remote push reviews from the empty tree when no remote refs exist",()=>{
  const root=tempRepo();
  put(root,"first.js","export const x = eval(input);\n"); commitAll(root,"first");
  const local=run("git",["rev-parse","HEAD"],root).trim();
  const scope=resolveReviewScope(root,{push:true,pushInput:`refs/heads/main ${local} refs/heads/main ${"0".repeat(40)}\n`});
  assert.notEqual(scope.baseRef,local);
  assert.equal(scope.headRef,local);
});
