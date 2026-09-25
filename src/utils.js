import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const SEVERITIES = ["critical", "high", "medium", "low", "info"];
export const CATEGORIES = [
  "correctness",
  "security",
  "concurrency",
  "database",
  "authorization",
  "tenant-isolation",
  "reliability",
  "performance",
  "api",
];

export function stableId(parts) {
  const text = Array.isArray(parts) ? parts.join("|") : String(parts);
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function severityRank(severity) {
  const index = SEVERITIES.indexOf(severity);
  return index === -1 ? 99 : index;
}

export function isAtLeastSeverity(severity, threshold) {
  if (!threshold || threshold === "none") return false;
  return severityRank(severity) <= severityRank(threshold);
}

export function findUp(filename, start = process.cwd()) {
  let current = resolve(start);
  for (;;) {
    const candidate = resolve(current, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function readText(path, maxBytes = 1_500_000) {
  try {
    const buffer = readFileSync(path);
    if (buffer.includes(0)) return undefined;
    return buffer.subarray(0, maxBytes).toString("utf8");
  } catch {
    return undefined;
  }
}

export function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function globToRegExp(glob) {
  const normalized = normalizePath(glob);
  let source = "";
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === "*") {
      if (normalized[i + 1] === "*") {
        i++;
        if (normalized[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else source += ".*";
      } else source += "[^/]*";
    } else if (char === "?") source += "[^/]";
    else source += char.replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export function matchesAnyGlob(path, globs = []) {
  const normalized = normalizePath(path);
  return globs.some((glob) => {
    try {
      return globToRegExp(glob).test(normalized);
    } catch {
      return false;
    }
  });
}

export function truncate(text, max = 800) {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function dedupe(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key);
    if (!existing || (item.confidence ?? item.reviewerConfidence ?? 0) > (existing.confidence ?? existing.reviewerConfidence ?? 0)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

export function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return {};
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((x) => parseScalar(x)).filter((x) => x !== "");
  }
  return value;
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.replace(/\t/g, "  ").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const original = lines[index];
    const noComment = stripYamlComment(original);
    if (!noComment.trim()) continue;
    const indent = noComment.match(/^ */)[0].length;
    const content = noComment.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;
    if (content.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`Unsupported YAML list placement at line ${index + 1}`);
      parent.push(parseScalar(content.slice(2)));
      continue;
    }
    const colon = content.indexOf(":");
    if (colon < 1) throw new Error(`Invalid YAML at line ${index + 1}`);
    const key = content.slice(0, colon).trim();
    const rest = content.slice(colon + 1).trim();
    if (rest) {
      parent[key] = parseScalar(rest);
      continue;
    }
    const next = nextMeaningful(lines, index + 1);
    const child = next && next.indent > indent && next.content.startsWith("- ") ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child });
  }
  return root;
}

function nextMeaningful(lines, start) {
  for (let i = start; i < lines.length; i++) {
    const line = stripYamlComment(lines[i]).replace(/\t/g, "  ");
    if (!line.trim()) continue;
    return { indent: line.match(/^ */)[0].length, content: line.trim() };
  }
  return undefined;
}

function stripYamlComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== "\\") quote = quote === char ? null : quote || char;
    if (char === "#" && !quote) return line.slice(0, i);
  }
  return line;
}

export function pathLineSnippet(content, line, radius = 2) {
  if (!content || !line) return undefined;
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, line - 1 - radius);
  const end = Math.min(lines.length, line + radius);
  return lines.slice(start, end).map((value, i) => `${String(start + i + 1).padStart(5)} | ${value}`).join("\n");
}
