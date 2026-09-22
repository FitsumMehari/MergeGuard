export type Platform = "github" | "gitlab";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingCategory = "bug" | "security" | "performance" | "scalability" | "maintainability" | "readability" | "architecture" | "solid" | "database" | "api" | "concurrency" | "testing" | "reliability";
export type RiskLevel = "low" | "medium" | "high" | "critical";
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
        bug: true, security: true, performance: true, scalability: true,
        maintainability: true, readability: true, architecture: true, solid: true,
        database: true, api: true, concurrency: true, testing: true, reliability: true
    },
    confidence: { inline: 0.86, report: 0.72 },
    ignorePaths: ["dist/**", "build/**", "coverage/**", "*.min.js"],
    failOn: ["critical"]
};
export const severityWeight: Record<Severity, number> = {
    critical: 45, high: 28, medium: 14, low: 5, info: 1
};
export function riskFromFindings(findings: Finding[], signals: StaticSignal[]): {
    level: RiskLevel;
    score: number;
    confidence: number;
} {
    let raw = findings.reduce((n, f) => n + severityWeight[f.severity] * f.confidence, 0);
    raw += signals.filter(s => s.severity === "high" || s.severity === "critical").reduce((n, s) => n + 2 * s.confidence, 0);
    const score = Math.min(100, Math.round(raw));
    const level: RiskLevel = score >= 75 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
    const confidence = findings.length ? Math.min(0.99, findings.reduce((n, f) => n + f.confidence, 0) / findings.length) : 0.72;
    return { level, score, confidence: Number(confidence.toFixed(3)) };
}
export function lineFromPatch(patch: string | undefined, needle: string): number | undefined {
    if (!patch)
        return undefined;
    let newLine = 0;
    for (const line of patch.split("\n")) {
        const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
        if (h) {
            newLine = Number(h[1]);
            continue;
        }
        if (line.startsWith("+") && !line.startsWith("+++")) {
            if (line.includes(needle))
                return newLine;
            newLine++;
        }
        else if (!line.startsWith("-"))
            newLine++;
    }
    return undefined;
}

