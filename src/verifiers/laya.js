import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verificationQuestions, IMPACT_LABELS } from "./questions.js";
import { clamp01 } from "../utils.js";

const bridgePath = fileURLToPath(new URL("../../scripts/laya_bridge.py", import.meta.url));

export const LAYA_MISSING_MESSAGE = `Laya verification was requested but Laya is not installed.

Install:
  python -m pip install laya

Then verify:
  mergeguard doctor

Or use:
  mergeguard review --verifier offline`;

export function detectPython(config = { laya: {} }) {
  for (const spec of pythonCommands(config)) {
    const check = spawnSync(spec.command, [...spec.prefix, "--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    const text = `${check.stdout || ""}${check.stderr || ""}`.trim();
    if (check.status === 0 && /python/i.test(text)) {
      return { available: true, command: spec.command, prefix: spec.prefix, version: text.split("\n")[0] };
    }
  }
  return { available: false };
}

export function detectLaya(config = { laya: {} }) {
  for (const spec of pythonCommands(config)) {
    const check = spawnSync(spec.command, [...spec.prefix, "-c", "import laya; print(getattr(laya, '__version__', 'installed'))"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    if (check.status === 0) return { available: true, command: spec.command, prefix: spec.prefix, version: (check.stdout || "").trim() || "installed" };
  }
  return { available: false };
}

export function verifyWithLaya(items, config) {
  const detected = detectLaya(config);
  if (!detected.available) {
    throw new Error(LAYA_MISSING_MESSAGE);
  }
  const payload = {
    model: config.laya?.model || null,
    max_len: config.laya?.maxLen || 4096,
    questions: verificationQuestions,
    items: items.map(({ candidate, context }) => ({ id: candidate.id, state: context })),
  };
  const timeout = Number(process.env.MERGEGUARD_LAYA_TIMEOUT_MS || 180_000);
  const result = spawnSync(detected.command, [...detected.prefix, bridgePath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout,
    windowsHide: true,
  });
  if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
    throw new Error(`Laya verification timed out after ${timeout}ms`);
  }
  if (result.status !== 0) {
    const detail = truncateMessage(result.stderr || result.stdout || result.error?.message || "unknown error");
    throw new Error(`Laya verification failed: ${detail}`);
  }
  let parsed;
  try {
    parsed = JSON.parse((result.stdout || "").trim());
  } catch {
    throw new Error(`Laya returned invalid JSON: ${truncateMessage(result.stdout)}`);
  }
  const byId = new Map((parsed.items || []).map((item) => [item.id, item]));
  return items.map(({ candidate }) => normalizeLaya(candidate, byId.get(candidate.id)?.answers || {}, config));
}

function normalizeLaya(candidate, answers, config) {
  const noul = (key, fallback) => typeof answers[key]?.noul === "number" ? answers[key].noul : fallback;
  const plausible = noul("plausible", candidate.reviewerConfidence ?? 0.6);
  const reachable = noul("reachable", 0.68);
  const existingProtection = noul("protected", 0.2);
  const worthReporting = noul("report", candidate.reviewerConfidence ?? 0.6);
  const impact = scoreTo01(answers.severe, candidate.severity);
  const strength = plausible * 0.31 + reachable * 0.18 + impact * 0.12 + (1 - existingProtection) * 0.14 + worthReporting * 0.25;
  return {
    plausible: round(plausible),
    reachable: round(reachable),
    impact: round(impact),
    existingProtection: round(existingProtection),
    worthReporting: round(worthReporting),
    strength: round(strength),
    verdict: strength >= config.confidence ? "report" : "suppress",
    provider: "laya",
  };
}

function scoreTo01(answer, severity) {
  if (typeof answer?.score === "number") return answer.score > 1 ? Math.min(1, answer.score / 4) : clamp01(answer.score);
  if (answer?.choice) return IMPACT_LABELS[answer.choice] ?? 0.55;
  if (answer?.probabilities && typeof answer.probabilities === "object") {
    let sum = 0;
    let total = 0;
    for (const [label, probability] of Object.entries(answer.probabilities)) {
      if (Object.hasOwn(IMPACT_LABELS, label) && typeof probability === "number") {
        sum += IMPACT_LABELS[label] * probability;
        total += probability;
      }
    }
    if (total) return sum / total;
  }
  return { critical: 1, high: 0.8, medium: 0.55, low: 0.3, info: 0.15 }[severity] ?? 0.55;
}

function pythonCommands(config) {
  const explicit = config?.laya?.python || process.env.MERGEGUARD_PYTHON;
  if (explicit) return [{ command: explicit, prefix: [] }];
  return process.platform === "win32"
    ? [{ command: "py", prefix: ["-3"] }, { command: "python", prefix: [] }]
    : [{ command: "python3", prefix: [] }, { command: "python", prefix: [] }];
}

function round(value) { return Number(clamp01(value).toFixed(3)); }

function truncateMessage(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
}
