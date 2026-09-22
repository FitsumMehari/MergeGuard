export type RiskLevel = "low" | "medium" | "high" | "critical" | string;

export interface AnalysisSummary {
  id: string;
  riskLevel?: RiskLevel | null;
  riskScore?: number | null;
  riskConfidence?: number | null;
  status: string;
  filesReviewed: number;
  createdAt: string;
  _count: { findings: number };
  changeRequest: {
    number: number;
    title: string;
    repository: { owner: string; name: string };
  };
}

export interface AnalysisDetail extends AnalysisSummary {
  findings: Array<{
    id: string;
    severity: string;
    category: string;
    confidence: number;
    title: string;
    description: string;
    file: string;
    startLine?: number | null;
    executionPath?: string[] | null;
    edgeCase?: unknown;
    remediation?: string | null;
    suggestedTest?: string | null;
  }>;
}

export const RISK_LEVELS = new Set(["low", "medium", "high", "critical", "info"]);

export function pillClass(value: string | null | undefined): string {
  const normalized = (value || "").toLowerCase();
  return RISK_LEVELS.has(normalized) ? normalized : "";
}
