import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verificationQuestions, IMPACT_LABELS } from "./questions.js";
import { clamp01 } from "../utils.js";

const bridgePath = fileURLToPath(new URL("../../scripts/laya_bridge.py", import.meta.url));

export function detectLaya(config) {
  for (const spec of pythonCommands(config)) {
    const check = spawnSync(spec.command, [...spec.prefix, "-c", "import laya; print(getattr(laya, '__version__', 'installed'))"], { encoding: "utf8", timeout: 5000 });
    if (check.status === 0) return { available: true, command: spec.command, prefix: spec.prefix, version: check.stdout.trim() || "installed" };
  }
  return { available: false };
}

export function verifyWithLaya(items, config) {
  const detected = detectLaya(config);
  if (!detected.available) throw new Error('Laya is not installed. Install Python 3.10+ and run "python -m pip install laya", or use verifier: offline.');
  const payload = {
    model: config.laya.model || null,
    max_len: config.laya.maxLen || 4096,
    questions: verificationQuestions,
    items: items.map(({ candidate, context }) => ({ id: candidate.id, state: context })),
  };
  const result = spawnSync(detected.command, [...detected.prefix, bridgePath], {
    input: JSON.stringify(payload), encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: Number(process.env.MERGEGUARD_LAYA_TIMEOUT_MS || 180000),
  });
  if (result.status !== 0) throw new Error(`Laya verification failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error(`Laya returned invalid output: ${result.stdout.slice(0, 500)}`); }
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
  const strength = plausible * 0.31 + reachable * 0.18 + impact * 0.12 + (1-existingProtection) * 0.14 + worthReporting * 0.25;
  return { plausible: round(plausible), reachable: round(reachable), impact: round(impact), existingProtection: round(existingProtection), worthReporting: round(worthReporting), strength: round(strength), verdict: strength >= config.confidence ? "report" : "suppress", provider: "laya" };
}

function scoreTo01(answer, severity) {
  if (typeof answer?.score === "number") return answer.score > 1 ? Math.min(1, answer.score / 4) : clamp01(answer.score);
  if (answer?.choice) return IMPACT_LABELS[answer.choice] ?? 0.55;
  if (answer?.probabilities) {
    let sum=0,total=0; for (const [label,p] of Object.entries(answer.probabilities)) if (label in IMPACT_LABELS) { sum += IMPACT_LABELS[label] * p; total += p; }
    if (total) return sum/total;
  }
  return {critical:1,high:.8,medium:.55,low:.3,info:.15}[severity] ?? .55;
}
function pythonCommands(config) {
  const explicit = config.laya.python || process.env.MERGEGUARD_PYTHON;
  if (explicit) return [{ command: explicit, prefix: [] }];
  return process.platform === "win32" ? [{command:"py",prefix:["-3"]},{command:"python",prefix:[]}] : [{command:"python3",prefix:[]},{command:"python",prefix:[]}];
}
function round(value){return Number(clamp01(value).toFixed(3));}
