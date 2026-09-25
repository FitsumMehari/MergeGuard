import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "mergeguard-test-"));
  run("git", ["init", "-q"], root);
  run("git", ["config", "user.email", "mergeguard@example.test"], root);
  run("git", ["config", "user.name", "MergeGuard Test"], root);
  return root;
}
export function put(root, path, content) { const full=join(root,path); mkdirSync(dirname(full),{recursive:true}); writeFileSync(full,content); }
export function commitAll(root, message="baseline") { run("git", ["add","-A"], root); run("git",["commit","-qm",message],root); }
export function run(command,args,cwd,options={}) { return execFileSync(command,args,{cwd,encoding:"utf8",stdio:["pipe","pipe","pipe"],...options}); }
export function spawn(command,args,cwd,options={}) { return spawnSync(command,args,{cwd,encoding:"utf8",...options}); }
export function read(root,path){return readFileSync(join(root,path),"utf8");}
