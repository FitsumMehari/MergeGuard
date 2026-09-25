import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchesAnyGlob, normalizePath } from "./utils.js";

const ZERO_SHA = /^0+$/;

export function git(args, { cwd = process.cwd(), input, allowFailure = false, encoding = "utf8" } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      input,
      encoding,
      maxBuffer: 64 * 1024 * 1024,
      stdio: [input === undefined ? "pipe" : "pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if (allowFailure) return undefined;
    const stderr = error?.stderr?.toString?.().trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
}

export function repositoryRoot(cwd = process.cwd()) {
  const root = git(["rev-parse", "--show-toplevel"], { cwd, allowFailure: true })?.trim();
  if (!root) throw new Error("Not inside a Git repository");
  return root;
}

export function gitAvailable() {
  return Boolean(git(["--version"], { allowFailure: true }));
}

export function resolveReviewScope(root, options = {}) {
  const hasHead = Boolean(git(["rev-parse", "--verify", "HEAD"], { cwd: root, allowFailure: true }));
  const initialBase = hasHead ? "HEAD" : emptyTree(root);
  if (options.push) return resolvePushScope(root, options.pushInput);
  if (options.staged) {
    return {
      mode: "staged",
      label: "staged changes",
      diffArgs: ["diff", "--cached", "--find-renames", initialBase],
      baseRef: initialBase,
      headKind: "index",
      headRef: undefined,
    };
  }
  if (options.base || options.head) {
    const base = options.base || defaultBaseRef(root);
    const head = options.head || "HEAD";
    const mergeBase = git(["merge-base", base, head], { cwd: root, allowFailure: true })?.trim();
    if (!mergeBase) throw new Error(`Could not find a merge-base between ${base} and ${head}`);
    return {
      mode: "range",
      label: `${base}...${head}`,
      diffArgs: ["diff", "--find-renames", `${base}...${head}`],
      baseRef: mergeBase,
      headKind: "ref",
      headRef: head,
    };
  }
  return {
    mode: "working",
    label: hasHead ? "working tree vs HEAD" : "working tree vs empty repository",
    diffArgs: ["diff", "--find-renames", initialBase],
    baseRef: initialBase,
    headKind: "working",
    headRef: undefined,
  };
}

function resolvePushScope(root, pushInput) {
  const lines = String(pushInput ?? "").trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO_SHA.test(localSha)) continue;
    let baseRef = remoteSha && !ZERO_SHA.test(remoteSha) ? remoteSha : undefined;
    if (!baseRef) {
      const remoteName = process.env.MERGEGUARD_REMOTE || "origin";
      const target = remoteDefaultRef(root, remoteName);
      if (target) baseRef = git(["merge-base", localSha, target], { cwd: root, allowFailure: true })?.trim();
    }
    if (!baseRef) baseRef = emptyTree(root);
    return {
      mode: "push",
      label: `${localRef || "local"} → ${remoteRef || "remote"}`,
      diffArgs: ["diff", "--find-renames", `${baseRef}..${localSha}`],
      baseRef,
      headKind: "ref",
      headRef: localSha,
    };
  }

  const head = git(["rev-parse", "HEAD"], { cwd: root }).trim();
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd: root, allowFailure: true })?.trim();
  const target = upstream || defaultBaseRef(root);
  const base = git(["merge-base", head, target], { cwd: root, allowFailure: true })?.trim();
  if (!base) {
    const parent = git(["rev-parse", "--verify", `${head}^`], { cwd: root, allowFailure: true })?.trim();
    if (!parent) return { mode: "push", label: "initial push", diffArgs: ["diff", "--find-renames", `${emptyTree(root)}..${head}`], baseRef: emptyTree(root), headKind: "ref", headRef: head };
    throw new Error("Could not determine the outgoing push range. Configure an upstream or pass the pre-push input through the installed hook.");
  }
  return { mode: "push", label: `${target}..HEAD`, diffArgs: ["diff", "--find-renames", `${base}..${head}`], baseRef: base, headKind: "ref", headRef: head };
}

function remoteDefaultRef(root, remote = "origin") {
  const symbolic = git(["symbolic-ref", `refs/remotes/${remote}/HEAD`], { cwd: root, allowFailure: true })?.trim();
  if (symbolic) return symbolic.replace(/^refs\/remotes\//, "");
  for (const candidate of [`${remote}/main`, `${remote}/master`]) {
    if (git(["rev-parse", "--verify", candidate], { cwd: root, allowFailure: true })) return candidate;
  }
  return undefined;
}

export function defaultBaseRef(root, remote = "origin") {
  const symbolic = git(["symbolic-ref", `refs/remotes/${remote}/HEAD`], { cwd: root, allowFailure: true })?.trim();
  if (symbolic) return symbolic.replace(/^refs\/remotes\//, "");
  for (const candidate of [`${remote}/main`, `${remote}/master`, "main", "master"]) {
    if (git(["rev-parse", "--verify", candidate], { cwd: root, allowFailure: true })) return candidate;
  }
  return "HEAD^";
}

export function collectChangedFiles(root, scope, { includeUntracked = true, maxFiles = 300, ignore = [] } = {}) {
  const diffArgs = scope.diffArgs.slice(1);
  const raw = git(["diff", "--name-status", "-z", ...diffArgs], { cwd: root, encoding: "buffer" });
  const tokens = raw.toString("utf8").split("\0").filter(Boolean);
  const entries = [];
  for (let i = 0; i < tokens.length;) {
    const statusToken = tokens[i++];
    const code = statusToken[0];
    if (code === "R" || code === "C") {
      const previousPath = normalizePath(tokens[i++] || "");
      const path = normalizePath(tokens[i++] || "");
      entries.push({ path, previousPath, status: code === "R" ? "renamed" : "added" });
    } else {
      const path = normalizePath(tokens[i++] || "");
      entries.push({ path, status: code === "A" ? "added" : code === "D" ? "deleted" : "modified" });
    }
  }

  if (scope.mode === "working" && includeUntracked) {
    const untrackedRaw = git(["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "buffer" });
    for (const path of untrackedRaw.toString("utf8").split("\0").filter(Boolean)) {
      if (!entries.some((entry) => entry.path === normalizePath(path))) entries.push({ path: normalizePath(path), status: "added", untracked: true });
    }
  }

  const reviewable = entries.filter((entry) => !matchesAnyGlob(entry.path, ignore));
  const totalFiles = reviewable.length;
  const ignoredFiles = entries.length - reviewable.length;
  const limited = reviewable.slice(0, maxFiles);
  const files = limited.map((entry) => hydrateChangedFile(root, scope, entry));
  return { files, totalFiles, ignoredFiles, truncated: totalFiles > maxFiles };
}

function hydrateChangedFile(root, scope, entry) {
  let patch;
  let headContent;
  let baseContent;
  if (entry.untracked) {
    headContent = safeReadWorking(root, entry.path);
    patch = createAddedPatch(entry.path, headContent || "");
  } else {
    const args = scope.diffArgs.slice(1);
    patch = git(["diff", "--no-ext-diff", "--unified=3", ...args, "--", entry.path], { cwd: root, allowFailure: true }) || "";
    headContent = entry.status === "deleted" ? undefined : readHeadContent(root, scope, entry.path);
  }
  if (scope.baseRef && entry.status !== "added") baseContent = gitShow(root, scope.baseRef, entry.previousPath || entry.path);
  const { additions, deletions } = patchStats(patch);
  return { ...entry, additions, deletions, patch, headContent, baseContent };
}

function readHeadContent(root, scope, path) {
  if (scope.headKind === "working") return safeReadWorking(root, path);
  if (scope.headKind === "index") return gitShow(root, "", path, true);
  return gitShow(root, scope.headRef || "HEAD", path);
}

function safeReadWorking(root, path) {
  const full = resolve(root, path);
  if (!existsSync(full)) return undefined;
  try {
    const buffer = readFileSync(full);
    if (buffer.includes(0)) return undefined;
    return buffer.length > 2_000_000 ? buffer.subarray(0, 2_000_000).toString("utf8") : buffer.toString("utf8");
  } catch {
    return undefined;
  }
}

function gitShow(root, ref, path, index = false) {
  const spec = index ? `:${path}` : `${ref}:${path}`;
  const result = git(["show", spec], { cwd: root, allowFailure: true, encoding: "buffer" });
  if (!result || result.includes(0)) return undefined;
  return result.length > 2_000_000 ? result.subarray(0, 2_000_000).toString("utf8") : result.toString("utf8");
}

function createAddedPatch(path, content) {
  const lines = content.split(/\r?\n/);
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}`;
}

function patchStats(patch = "") {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}

export function repositoryInfo(root) {
  const headSha = git(["rev-parse", "HEAD"], { cwd: root, allowFailure: true })?.trim() || "working";
  const branch = git(["branch", "--show-current"], { cwd: root, allowFailure: true })?.trim() || "detached";
  const remoteUrl = git(["config", "--get", "remote.origin.url"], { cwd: root, allowFailure: true })?.trim();
  return { root, headSha, branch, remoteUrl };
}

export function trackedFiles(root) {
  const raw = git(["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  return raw.toString("utf8").split("\0").filter(Boolean).map(normalizePath);
}

function emptyTree(root) {
  return git(["mktree"], { cwd: root, input: "" }).trim();
}
