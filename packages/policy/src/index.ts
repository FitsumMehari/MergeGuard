import YAML from "yaml";
import {
  clamp01,
  defaultReviewConfig,
  isFindingCategory,
  isSeverity,
  type FindingCategory,
  type ReviewConfig,
  type Severity,
} from "@mergeguard/core";

interface PolicyDocument {
  review?: Record<string, unknown>;
  confidence?: { inline_comment?: unknown; report?: unknown };
  ignore?: { paths?: unknown };
  risk?: { fail_on?: unknown };
}

export function parsePolicy(text?: string): ReviewConfig {
  if (!text) return defaultReviewConfig;
  const parsed = (YAML.parse(text) ?? {}) as PolicyDocument;
  return {
    ...defaultReviewConfig,
    categories: mergeCategories(parsed.review),
    confidence: {
      inline: readUnitInterval(parsed.confidence?.inline_comment, defaultReviewConfig.confidence.inline),
      report: readUnitInterval(parsed.confidence?.report, defaultReviewConfig.confidence.report),
    },
    ignorePaths: readStringArray(parsed.ignore?.paths) ?? defaultReviewConfig.ignorePaths,
    failOn: readSeverities(parsed.risk?.fail_on) ?? defaultReviewConfig.failOn,
  };
}

function mergeCategories(input?: Record<string, unknown>): Record<FindingCategory, boolean> {
  const categories = { ...defaultReviewConfig.categories };
  if (!input) return categories;
  for (const [key, value] of Object.entries(input)) {
    if (isFindingCategory(key) && typeof value === "boolean") {
      categories[key] = value;
    }
  }
  return categories;
}

function readUnitInterval(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? clamp01(numeric) : fallback;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return paths.length ? paths : undefined;
}

function readSeverities(value: unknown): Severity[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const severities = value.filter(isSeverity);
  return severities.length ? severities : undefined;
}
