import type { Finding, RiskLevel, Severity, StaticSignal } from "./types.js";

export const severityWeight: Record<Severity, number> = {
  critical: 45,
  high: 28,
  medium: 14,
  low: 5,
  info: 1,
};

export function riskFromFindings(
  findings: Finding[],
  signals: StaticSignal[],
): { level: RiskLevel; score: number; confidence: number } {
  let raw = findings.reduce((n, finding) => n + severityWeight[finding.severity] * finding.confidence, 0);
  raw += signals
    .filter((signal) => signal.severity === "high" || signal.severity === "critical")
    .reduce((n, signal) => n + 2 * signal.confidence, 0);
  const score = Math.min(100, Math.round(raw));
  const level: RiskLevel = score >= 75 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  const confidence = findings.length
    ? Math.min(0.99, findings.reduce((n, finding) => n + finding.confidence, 0) / findings.length)
    : 0.72;
  return { level, score, confidence: Number(confidence.toFixed(3)) };
}
