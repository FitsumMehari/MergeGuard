import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync } from "node:fs";
import { installHook, uninstallHook, hookStatus, hookPath } from "../src/hook.js";
import { tempRepo, put, commitAll, read } from "./helpers.js";

test("hook install preserves existing pre-push content",()=>{
  const root=tempRepo(); put(root,"README.md","x\n"); commitAll(root);
  const path=hookPath(root); put(root,path.slice(root.length+1),"#!/bin/sh\necho existing-check\n"); chmodSync(path,0o755);
  const installed=installHook(root);
  assert.equal(installed.changed,true);
  const text=read(root,path.slice(root.length+1));
  assert(text.includes("existing-check"));
  assert(text.includes("# >>> mergeguard >>>"));
  assert.equal(hookStatus(root).installed,true);
  uninstallHook(root);
  const after=read(root,path.slice(root.length+1));
  assert(after.includes("existing-check"));
  assert(!after.includes("# >>> mergeguard >>>"));
});
