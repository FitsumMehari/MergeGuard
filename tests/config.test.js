import test from "node:test";
import assert from "node:assert/strict";
import { parseSimpleYaml, matchesAnyGlob } from "../src/utils.js";
import { normalizeConfig } from "../src/config.js";

test("simple YAML supports MergeGuard config shape", () => {
  const parsed=parseSimpleYaml(`fail_on: medium\nverifier:\n  engine: offline\nignore:\n  paths:\n    - vendor/**\n    - generated/**\nreview:\n  performance: false\n`);
  const config=normalizeConfig(parsed);
  assert.equal(config.failOn,"medium");
  assert.equal(config.verifier,"offline");
  assert.deepEqual(config.ignore,["vendor/**","generated/**"]);
  assert.equal(config.categories.performance,false);
});

test("glob matcher handles recursive patterns",()=>{
  assert(matchesAnyGlob("node_modules/a/index.js",["node_modules/**"]));
  assert(matchesAnyGlob("src/generated/a.ts",["**/generated/**"]));
  assert(matchesAnyGlob("public/x.min.js",["**/*.min.js"]));
  assert(!matchesAnyGlob("src/app.js",["dist/**"]));
});
