import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NPM_PACKAGE_NAME } from "../src/package-meta.js";
import { githubWorkflow, gitlabWorkflow } from "../src/ci.js";
import { commitAll, put, tempRepo } from "./helpers.js";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Child npm processes must not inherit a parent `npm publish --dry-run`
 * configuration. Otherwise `npm pack` reports a filename but writes nothing.
 */
function npmEnvWithoutDryRun(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (/^npm_config_dry[_-]?run$/i.test(key)) delete env[key];
  }
  env.npm_config_dry_run = "false";
  return env;
}

/**
 * Pack from the MergeGuard project root into an explicit temporary directory.
 * Filename comes only from npm's --json output. Always creates a real tarball,
 * even when this process inherited npm_config_dry_run=true from
 * `npm publish --dry-run` → prepublishOnly → npm run check.
 */
export function packTarballWithNpm() {
  const packDir = mkdtempSync(join(tmpdir(), "mergeguard-pack-"));
  const result = spawnSync(
    npmCommand,
    ["pack", "--dry-run=false", "--json", "--pack-destination", packDir],
    {
      cwd: projectRoot,
      encoding: "utf8",
      shell: false,
      env: npmEnvWithoutDryRun(),
    },
  );

  assert.equal(
    result.status,
    0,
    `npm pack failed (status ${result.status}):\n${result.stderr || result.stdout || result.error?.message || "no output"}`,
  );

  let packed;
  try {
    packed = JSON.parse((result.stdout || "").trim());
  } catch (error) {
    assert.fail(
      `npm pack --json returned invalid JSON:\n${result.stdout}\n${result.stderr}\n${error.message}`,
    );
  }

  assert.ok(Array.isArray(packed) && packed.length === 1, `expected one pack entry, got: ${JSON.stringify(packed)}`);
  const filename = packed[0].filename;
  assert.ok(filename, "npm pack --json did not include filename");

  const tarballPath = resolve(packDir, filename);
  assert.ok(
    existsSync(tarballPath),
    `npm pack reported ${filename}, but tarball was not created at ${tarballPath}`,
  );
  const size = statSync(tarballPath).size;
  assert.ok(size > 0, `npm tarball exists but is empty: ${tarballPath}`);

  return { tarballPath, filename, packDir, size };
}

function installAndExerciseTarball(tarballPath, filename) {
  const consumerRoot = mkdtempSync(join(tmpdir(), "mergeguard-consumer-"));
  try {
    writeFileSync(
      join(consumerRoot, "package.json"),
      JSON.stringify({ name: "consumer", private: true, type: "module" }),
    );

    const install = spawnSync(npmCommand, ["install", "--dry-run=false", tarballPath], {
      cwd: consumerRoot,
      encoding: "utf8",
      shell: false,
      env: npmEnvWithoutDryRun(),
    });
    assert.equal(install.status, 0, `npm install ${filename} failed:\n${install.stderr || install.stdout}`);

    const version = spawnSync(npmCommand, ["exec", "--", "mergeguard", "--version"], {
      cwd: consumerRoot,
      encoding: "utf8",
      shell: false,
      env: npmEnvWithoutDryRun(),
    });
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /mergeguard 0\.1\.0/);

    const help = spawnSync(npmCommand, ["exec", "--", "mergeguard", "--help"], {
      cwd: consumerRoot,
      encoding: "utf8",
      shell: false,
      env: npmEnvWithoutDryRun(),
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /USAGE/);

    const probe = join(consumerRoot, "import-probe.mjs");
    writeFileSync(
      probe,
      `import { review, VERSION } from "@fitsummehari/mergeguard";
if (typeof review !== "function") throw new Error("review missing");
if (VERSION !== "0.1.0") throw new Error("bad version " + VERSION);
console.log("scoped_api_ok", VERSION);
`,
    );
    const imported = spawnSync(process.execPath, [probe], {
      cwd: consumerRoot,
      encoding: "utf8",
      shell: false,
      env: process.env,
    });
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /scoped_api_ok 0\.1\.0/);

    const repo = tempRepo();
    try {
      put(repo, "ok.js", "export const x = 1;\n");
      commitAll(repo, "ok");
      const reviewProbe = join(consumerRoot, "review-probe.mjs");
      writeFileSync(
        reviewProbe,
        `import { review } from "@fitsummehari/mergeguard";
const result = await review({ cwd: process.argv[2], noAi: true });
if (!result.passed) process.exit(1);
console.log("review_ok");
`,
      );
      const reviewed = spawnSync(process.execPath, [reviewProbe, repo], {
        cwd: consumerRoot,
        encoding: "utf8",
        shell: false,
        env: process.env,
      });
      assert.equal(reviewed.status, 0, reviewed.stderr);
      assert.match(reviewed.stdout, /review_ok/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
}

test("package name is scoped and CI templates install it", () => {
  assert.equal(NPM_PACKAGE_NAME, "@fitsummehari/mergeguard");
  const gh = githubWorkflow();
  const gl = gitlabWorkflow();
  assert.match(gh, /npm install --save-dev @fitsummehari\/mergeguard/);
  assert.match(gl, /npm install --save-dev @fitsummehari\/mergeguard/);
  assert.match(gh, /npx mergeguard review --verifier offline/);
  assert.doesNotMatch(gh, /npm install --save-dev mergeguard[^-@]/);
  assert.doesNotMatch(gl, /npm install --save-dev mergeguard[^-@]/);
});

test("packed tarball installs, runs the CLI, and imports the scoped API", async () => {
  const { tarballPath, filename, packDir } = packTarballWithNpm();
  try {
    installAndExerciseTarball(tarballPath, filename);
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
});

test("npm pack still writes a real tarball when npm_config_dry_run is inherited", () => {
  // Simulate `npm publish --dry-run` → prepublishOnly → npm run check environment.
  const previous = process.env.npm_config_dry_run;
  process.env.npm_config_dry_run = "true";
  try {
    const { tarballPath, filename, packDir, size } = packTarballWithNpm();
    try {
      assert.ok(existsSync(tarballPath), `expected real tarball ${filename} under inherited dry-run`);
      assert.ok(size > 0);
      installAndExerciseTarball(tarballPath, filename);
    } finally {
      rmSync(packDir, { recursive: true, force: true });
    }
  } finally {
    if (previous === undefined) delete process.env.npm_config_dry_run;
    else process.env.npm_config_dry_run = previous;
  }
});
