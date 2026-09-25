import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { tempRepo, put, commitAll, spawn } from "./helpers.js";

const cli=fileURLToPath(new URL("../bin/mergeguard.js",import.meta.url));

test("CLI returns 1 for blocking findings and 0 with fail-on none",()=>{
  const root=tempRepo(); put(root,"a.py","def x():\n    return 1\n"); commitAll(root); put(root,"a.py","def x(url):\n    import requests\n    return requests.get(url, verify=False)\n");
  const blocked=spawn(process.execPath,[cli,"review","--no-ai","--no-color"],root);
  assert.equal(blocked.status,1);
  assert.match(blocked.stdout,/TLS certificate verification disabled/);
  const allowed=spawn(process.execPath,[cli,"review","--no-ai","--fail-on","none","--format","json"],root);
  assert.equal(allowed.status,0);
  assert.equal(JSON.parse(allowed.stdout).blocking,false);
});
