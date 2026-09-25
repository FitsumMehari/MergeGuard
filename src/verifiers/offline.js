import { clamp01 } from "../utils.js";

const IMPACT = { critical: 1, high: 0.8, medium: 0.55, low: 0.3, info: 0.15 };

export function offlineVerify(candidate, context, config) {
  let plausible = candidate.reviewerConfidence ?? 0.6;
  let reachable = 0.68;
  let existingProtection = 0.12;
  let worthReporting = plausible;
  const protection = context?.repository?.protections || {};
  const filesText = (context?.files || []).map((file) => file.content).join("\n");

  if (/check-then-create|read-check-write/.test(candidate.detector || "")) {
    if (protection.uniqueness && /@unique|unique\s*:\s*true|UNIQUE|UniqueConstraint|unique_together/i.test(filesText)) existingProtection = Math.max(existingProtection, 0.68);
    if (protection.transaction && /transaction|\$transaction|atomic|BeginTransaction|@Transactional/i.test(filesText)) existingProtection = Math.max(existingProtection, 0.58);
    reachable = 0.78;
  }
  if (/multiple-writes|transaction-boundary-removed/.test(candidate.detector || "")) {
    if (/\$transaction|transaction\.atomic|@Transactional|BeginTransaction|BEGIN\s+TRANSACTION/i.test(filesText)) existingProtection = Math.max(existingProtection, 0.78);
  }
  if (candidate.category === "authorization") {
    if (/APP_GUARD|global.*guard|UseAuthentication|UseAuthorization/i.test(filesText) && !/removed|bypass|anonymous/i.test(candidate.title)) existingProtection = Math.max(existingProtection, 0.65);
    reachable = 0.76;
  }
  if (candidate.category === "tenant-isolation") reachable = 0.82;
  if (/tls-disabled|unbounded-delete|unsafe-sql|dynamic-eval|tenant-filter-removed|uniqueness-removed/.test(candidate.detector || "")) {
    plausible = Math.max(plausible, 0.9);
    worthReporting = Math.max(worthReporting, 0.9);
    reachable = Math.max(reachable, 0.75);
    existingProtection = Math.min(existingProtection, 0.15);
  }
  if (/hardcoded-localhost|unbounded-parallelism|blocking-index|floating-promise|cors-wildcard/.test(candidate.detector || "")) worthReporting *= 0.78;

  const impact = IMPACT[candidate.severity] ?? 0.55;
  const strength = plausible * 0.31 + reachable * 0.18 + impact * 0.12 + (1 - existingProtection) * 0.14 + worthReporting * 0.25;
  const verdict = strength >= config.confidence ? "report" : "suppress";
  return {
    plausible: round(plausible), reachable: round(reachable), impact: round(impact), existingProtection: round(existingProtection), worthReporting: round(worthReporting), strength: round(clamp01(strength)), verdict, provider: "offline",
  };
}

function round(value) { return Number(clamp01(value).toFixed(3)); }
