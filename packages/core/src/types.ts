export type Platform = "github" | "gitlab";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingCategory =
  | "bug"
  | "security"
  | "performance"
  | "scalability"
  | "maintainability"
  | "readability"
  | "architecture"
  | "solid"
  | "database"
  | "api"
  | "concurrency"
  | "testing"
  | "reliability";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export const FINDING_CATEGORIES: readonly FindingCategory[] = [
  "bug",
  "security",
  "performance",
  "scalability",
  "maintainability",
  "readability",
  "architecture",
  "solid",
  "database",
  "api",
  "concurrency",
  "testing",
  "reliability",
] as const;

export const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low", "info"] as const;

export function isFindingCategory(value: unknown): value is FindingCategory {
  return typeof value === "string" && (FINDING_CATEGORIES as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
  patch?: string;
  headContent?: string;
  baseContent?: string;
}

export interface ChangeRequest {
  platform: Platform;
  repository: {
    id: string;
    owner: string;
    name: string;
    defaultBranch?: string;
    url?: string;
  };
  change: {
    id: string;
    number: number;
    title: string;
    description?: string;
    baseSha: string;
    headSha: string;
    author: {
      id: string;
      username: string;
    };
    url?: string;
  };
  files: ChangedFile[];
  metadata: {
    draft: boolean;
    labels: string[];
    installationId?: string;
    projectId?: string;
  };
}

export interface StaticSignal {
  id: string;
  category: FindingCategory;
  severity: Severity;
  file?: string;
  line?: number;
  title: string;
  description: string;
  confidence: number;
  evidence?: string[];
}

export interface CandidateFinding {
  id?: string;
  detector?: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  file: string;
  startLine?: number;
  endLine?: number;
  evidence: string[];
  executionPath?: string[];
  edgeCase?: {
    scenario: string;
    input?: string;
    expected?: string;
    actual?: string;
  };
  remediation?: string;
  suggestedTest?: string;
  reviewerConfidence: number;
}

export interface Verification {
  plausible: number;
  reachable: number;
  impact: number;
  existingProtection: number;
  worthReporting: number;
  verdict: "report" | "suppress";
  provider: "jev" | "offline";
}

export interface Finding extends CandidateFinding {
  id: string;
  confidence: number;
  verification: Verification;
  source: "detector" | "jev-verified";
}

export interface RiskAnalysis {
  risk: {
    level: RiskLevel;
    score: number;
    confidence: number;
  };
  findings: Finding[];
  signals: StaticSignal[];
  summary: {
    filesReviewed: number;
    relatedFilesReviewed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface ReviewConfig {
  categories: Record<FindingCategory, boolean>;
  confidence: {
    inline: number;
    report: number;
  };
  ignorePaths: string[];
  failOn: Severity[];
}

export const defaultReviewConfig: ReviewConfig = {
  categories: {
    bug: true,
    security: true,
    performance: true,
    scalability: true,
    maintainability: true,
    readability: true,
    architecture: true,
    solid: true,
    database: true,
    api: true,
    concurrency: true,
    testing: true,
    reliability: true,
  },
  confidence: { inline: 0.86, report: 0.72 },
  ignorePaths: ["dist/**", "build/**", "coverage/**", "*.min.js"],
  failOn: ["critical"],
};
