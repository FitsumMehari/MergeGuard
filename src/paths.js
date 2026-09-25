import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { normalizePath } from "./utils.js";

/** Join a repository-relative path only if it stays inside root. */
export function safeJoin(root, relativePath) {
  const normalized = normalizePath(String(relativePath || ""));
  if (!normalized || normalized.includes("\0") || isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    return undefined;
  }
  if (normalized.split("/").some((part) => part === "..")) return undefined;
  const rootResolved = resolve(root);
  const full = resolve(rootResolved, normalized);
  const rel = relative(rootResolved, full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  try {
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(full);
      const rootWithSep = rootResolved.endsWith(sep) ? rootResolved : `${rootResolved}${sep}`;
      if (real !== rootResolved && !real.startsWith(rootWithSep)) return undefined;
    } else if (!stat.isFile() && !stat.isDirectory()) {
      return undefined;
    }
  } catch {
    return full;
  }
  return full;
}

export function stripControlChars(text) {
  return String(text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}
