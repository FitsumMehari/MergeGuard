import YAML from "yaml";
import { defaultReviewConfig, type ReviewConfig } from "@mergeguard/core";
export function parsePolicy(text?: string): ReviewConfig {
    if (!text)
        return defaultReviewConfig;
    const x: any = YAML.parse(text) || {};
    return {
        ...defaultReviewConfig,
        categories: { ...defaultReviewConfig.categories, ...(x.review || {}) },
        confidence: { inline: Number(x.confidence?.inline_comment ?? defaultReviewConfig.confidence.inline), report: Number(x.confidence?.report ?? defaultReviewConfig.confidence.report) },
        ignorePaths: Array.isArray(x.ignore?.paths) ? x.ignore.paths : defaultReviewConfig.ignorePaths,
        failOn: Array.isArray(x.risk?.fail_on) ? x.risk.fail_on : defaultReviewConfig.failOn
    };
}

