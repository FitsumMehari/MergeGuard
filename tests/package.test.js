import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run, spawn, tempRepo, put, commitAll } from "./helpers.js";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function packTarball() {
  const dest = mkdtempSync(join(tmpdir(), "mergeguard-pack-"));
  const listed = run("npm", ["pack", "--pack-destination", dest], repoRoot);
  const name = listed.trim().split(/\s+/).at(-1);
  return join(dest, name);
}

test("packed tarball installs, runs the CLI, and imports the API", async () => {
  const tarball = packTarball();
  const project = tempRepo();
  put(project, "package.json", JSON.stringify({ name: "consumer", private: true, type: "module" }));
  const install = spawn("npm", ["install", tarball], project);
  assert.equal(install.status, 0, install.stderr);
  const bin = join(project, "node_modules", ".bin", "mergeguard");
  const version = spawn(bin, ["--version"], project);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /0\.1\.0/);
  const help = spawn(bin, ["--help"], project);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /USAGE/);

  put(project, "ok.js", "export const x = 1;\n");
  commitAll(project, "ok");
  const clean = spawn(bin, ["review", "--no-ai"], project);
  assert.equal(clean.status, 0, clean.stderr);

  const apiPath = pathToFileURL(join(project, "node_modules", "mergeguard", "src", "index.js")).href;
  const mod = await import(apiPath);
  assert.equal(typeof mod.review, "function");
  assert.equal(mod.VERSION, "0.1.0");
  const result = await mod.review({ cwd: project, noAi: true });
  assert.equal(result.passed, true);
});
