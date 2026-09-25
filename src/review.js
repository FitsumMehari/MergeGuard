import { loadConfig, normalizeConfig } from "./config.js";
import { collectChangedFiles, repositoryInfo, repositoryRoot, resolveReviewScope } from "./git.js";
import { buildRepositoryContext, contextForCandidate } from "./context.js";
import { diffRegressionCandidates, patternCandidates, staticSignals } from "./detectors/patterns.js";
import { repositoryAwareCandidates } from "./detectors/repository.js";
import { verifyCandidates } from "./verifiers/index.js";
import { dedupe, isAtLeastSeverity, matchesAnyGlob, severityRank } from "./utils.js";
import { stripControlChars } from "./paths.js";
import { VERSION } from "./version.js";

/**
 * Review a Git change set and return structured findings.
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {string} [options.base]
 * @param {string} [options.head]
 * @param {boolean} [options.staged]
 * @param {boolean} [options.push]
 * @returns {Promise<import("./types.js").ReviewResult>}
 */
export async function review(options = {}) {
  const root = repositoryRoot(options.cwd || process.cwd());
  const loaded = loadConfig(root, options.configPath);
  const config = applyOverrides(loaded.config, options);
  const scope = resolveReviewScope(root, options);
  const changed = collectChangedFiles(root, scope, {
    maxFiles: config.maxFiles,
    includeUntracked: options.includeUntracked !== false,
    ignore: config.ignore,
  });
  const files = changed.files;
  const warnings = [...(loaded.warnings || [])];
  if (changed.truncated) warnings.push(`${changed.totalFiles} files changed; only the first ${config.maxFiles} were analyzed.`);

  const repoContext = buildRepositoryContext(root, files, config);
  let candidates = [
    ...patternCandidates(files, { maxCandidates: config.maxCandidates }),
    ...diffRegressionCandidates(files),
    ...repositoryAwareCandidates(repoContext, files),
  ];
  candidates = dedupeCandidates(candidates)
    .filter((candidate) => config.categories[candidate.category] !== false)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || (b.reviewerConfidence || 0) - (a.reviewerConfidence || 0))
    .slice(0, config.maxCandidates);

  const verification = await verifyCandidates(
    candidates,
    (candidate) => contextForCandidate(repoContext, candidate, config),
    config,
    { onWarning: (warning) => warnings.push(warning) },
  );
  const findings = verification.findings.map(sanitizeFinding);
  const summary = summarize(files, findings, changed.totalFiles, changed.ignoredFiles);
  const blocking = findings.some((finding) => isAtLeastSeverity(finding.severity, config.failOn));
  const info = repositoryInfo(root);
  return {
    version: VERSION,
    passed: !blocking,
    blocking,
    failOn: config.failOn,
    repository: { root, branch: info.branch, headSha: info.headSha, remoteUrl: info.remoteUrl, stack: repoContext.stack, languages: repoContext.languages },
    scope: { mode: scope.mode, label: scope.label, baseRef: scope.baseRef, headRef: scope.headRef },
    config: { path: loaded.path, failOn: config.failOn, confidence: config.confidence, verifier: config.verifier },
    verifier: verification.provider,
    findings,
    signals: staticSignals(files),
    summary,
    warnings,
    metadata: { filesReviewed: files.length, candidateCount: candidates.length, truncated: changed.truncated },
  };
}

export async function reviewChangeSet({ root, files, scope = { mode: "synthetic", label: "provided change set" }, config: inputConfig = {}, repository = {} }) {
  const config = normalizeConfig(inputConfig);
  const filtered = files.filter((file) => !matchesAnyGlob(file.path, config.ignore));
  const repoContext = buildRepositoryContext(root, filtered, config);
  let candidates = [...patternCandidates(filtered, { maxCandidates: config.maxCandidates }), ...diffRegressionCandidates(filtered), ...repositoryAwareCandidates(repoContext, filtered)];
  candidates = dedupeCandidates(candidates).filter((item) => config.categories[item.category] !== false).slice(0, config.maxCandidates);
  const verification = await verifyCandidates(candidates, (candidate) => contextForCandidate(repoContext, candidate, config), config);
  const findings = verification.findings.map(sanitizeFinding);
  const blocking = findings.some((f) => isAtLeastSeverity(f.severity, config.failOn));
  return {
    version: VERSION,
    passed: !blocking,
    blocking,
    failOn: config.failOn,
    repository: { root, ...repository, stack: repoContext.stack, languages: repoContext.languages },
    scope,
    config: { failOn: config.failOn, confidence: config.confidence, verifier: config.verifier },
    verifier: verification.provider,
    findings,
    signals: staticSignals(filtered),
    summary: summarize(filtered, findings, files.length),
    warnings: [],
    metadata: { filesReviewed: filtered.length, candidateCount: candidates.length, truncated: false },
  };
}

function applyOverrides(base, options) {
  const config = structuredClone(base);
  if (options.failOn) config.failOn = String(options.failOn).toLowerCase();
  if (options.verifier) config.verifier = options.verifier === "deterministic" ? "offline" : options.verifier;
  if (options.noAi) config.verifier = "offline";
  if (Number.isFinite(options.confidence)) config.confidence = Number(options.confidence);
  if (Number.isInteger(options.maxFiles) && options.maxFiles > 0) config.maxFiles = options.maxFiles;
  if (Number.isInteger(options.maxCandidates) && options.maxCandidates > 0) config.maxCandidates = options.maxCandidates;
  return config;
}

function dedupeCandidates(candidates) {
  return dedupe(candidates, (item) => {
    const detector = item.detector || item.title;
    const family = /check-then-create|read-check-write|repo-no-unique-protection/.test(detector)
      ? "concurrency-race"
      : /auth-protection-removed|repo-sensitive-route-no-auth|allow-anonymous/.test(detector)
        ? "authorization-boundary"
        : detector;
    return `${item.file}:${item.startLine || 0}:${family}`;
  });
}

function summarize(files, findings, totalChangedFiles, ignoredFiles = 0) {
  const summary = { filesReviewed: files.length, totalChangedFiles, ignoredFiles, findings: findings.length, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) summary[finding.severity]++;
  return summary;
}

function sanitizeFinding(finding) {
  return {
    ...finding,
    title: stripControlChars(finding.title),
    description: stripControlChars(finding.description),
    remediation: finding.remediation ? stripControlChars(finding.remediation) : finding.remediation,
    file: stripControlChars(finding.file),
    evidence: (finding.evidence || []).map((item) => stripControlChars(item)),
  };
}
