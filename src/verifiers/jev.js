import { verificationQuestions, IMPACT_LABELS } from "./questions.js";
import { clamp01 } from "../utils.js";

export async function verifyWithJev(items, config) {
  const key = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
  if (!key) throw new Error("Jev verifier selected but TYPESAFE_API_KEY or JEV_API_KEY is not set.");
  const timeoutMs = Number(process.env.MERGEGUARD_JEV_TIMEOUT_MS || 30_000);
  const out = [];
  for (const { candidate, context } of items) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(config.jev.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.jev.model, state: context, questions: verificationQuestions }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`Jev verification timed out after ${timeoutMs}ms`);
      throw new Error("Jev verification request failed");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Jev verification failed with HTTP ${response.status}`);
    let json;
    try {
      json = await response.json();
    } catch {
      throw new Error("Jev verification returned invalid JSON");
    }
    out.push(normalize(candidate, json.answers || {}, config));
  }
  return out;
}

function normalize(candidate, answers, config) {
  const noul = (key, fallback) => typeof answers[key]?.noul === "number" ? answers[key].noul : fallback;
  const plausible = noul("plausible", candidate.reviewerConfidence ?? 0.6);
  const reachable = noul("reachable", 0.68);
  const existingProtection = noul("protected", 0.2);
  const worthReporting = noul("report", candidate.reviewerConfidence ?? 0.6);
  const impact = scoreTo01(answers.severe, candidate.severity);
  const strength = plausible * 0.31 + reachable * 0.18 + impact * 0.12 + (1 - existingProtection) * 0.14 + worthReporting * 0.25;
  return {
    plausible: r(plausible),
    reachable: r(reachable),
    impact: r(impact),
    existingProtection: r(existingProtection),
    worthReporting: r(worthReporting),
    strength: r(strength),
    verdict: strength >= config.confidence ? "report" : "suppress",
    provider: "jev",
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

function r(value) { return Number(clamp01(value).toFixed(3)); }
