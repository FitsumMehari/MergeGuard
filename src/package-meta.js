import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));

/** npm registry name from package.json (scoped). Product and CLI remain "MergeGuard" / "mergeguard". */
export const NPM_PACKAGE_NAME = pkg.name;

/** Spec for `npm install --save-dev …`. */
export function installSpec() {
  return NPM_PACKAGE_NAME;
}

/** One-off npx without a prior local install (avoids the unrelated unscoped `mergeguard` package). */
export function oneOffNpx(command = "review") {
  return `npx --package=${NPM_PACKAGE_NAME} mergeguard ${command}`;
}
