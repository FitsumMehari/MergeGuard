import { resolve } from "node:path";
import { loadConfig, normalizeConfig } from "./config.js";
import { collectChangedFiles, repositoryInfo, repositoryRoot, resolveReviewScope } from "./git.js";
import { buildRepositoryContext, contextForCandidate } from "./context.js";
import { diffRegressionCandidates, patternCandidates, staticSignals } from "./detectors/patterns.js";
import { repositoryAwareCandidates } from "./detectors/repository.js";
import { verifyCandidates } from "./verifiers/index.js";
import { dedupe, isAtLeastSeverity, matchesAnyGlob, severityRank } from "./utils.js";
import { VERSION } from "./version.js";

export async function review(options = {}) {
  const root = repositoryRoot(options.cwd || process.cwd());
  const loaded = loadConfig(root, options.configPath);
  const config = applyOverrides(loaded.config, options);
  const scope = resolveReviewScope(root, options);
  const changed = collectChangedFiles(root, scope, { maxFiles: config.maxFiles, includeUntracked: options.includeUntracked !== false, ignore: config.ignore });
  const files = changed.files;
  const warnings = [];
  if (changed.truncated) warnings.push(`${changed.totalFiles} files changed; only the first ${config.maxFiles} were analyzed.`);

  const repoContext = buildRepositoryContext(root, files, config);
  let candidates = [
    ...patternCandidates(files, { maxCandidates: config.maxCandidates }),
    ...diffRegressionCandidates(files),
    ...repositoryAwareCandidates(repoContext, files),
  ];
  candidates = dedupeCandidates(candidates)
    .filter((candidate) => config.categories[candidate.category] !== false)
    .sort((a,b) => severityRank(a.severity) - severityRank(b.severity) || (b.reviewerConfidence || 0) - (a.reviewerConfidence || 0))
    .slice(0, config.maxCandidates);

  const verification = await verifyCandidates(
    candidates,
    (candidate) => contextForCandidate(repoContext, candidate, config),
    config,
    { onWarning: (warning) => warnings.push(warning) },
  );
  const findings = verification.findings;
  const summary = summarize(files, findings, changed.totalFiles, changed.ignoredFiles);
  const blocking = findings.some((finding) => isAtLeastSeverity(finding.severity, config.failOn));
  const info = repositoryInfo(root);
  return {
    version: VERSION,
    repository: { root, branch: info.branch, headSha: info.headSha, remoteUrl: info.remoteUrl, stack: repoContext.stack, languages: repoContext.languages },
    scope: { mode: scope.mode, label: scope.label, baseRef: scope.baseRef, headRef: scope.headRef },
    config: { path: loaded.path, failOn: config.failOn, confidence: config.confidence, verifier: config.verifier },
    verifier: verification.provider,
    blocking,
    failOn: config.failOn,
    findings,
    signals: staticSignals(files),
    summary,
    warnings,
  };
}

export async function reviewChangeSet({ root, files, scope = { mode:"synthetic", label:"provided change set" }, config: inputConfig = {}, repository = {} }) {
  const config = normalizeConfig(inputConfig);
  const filtered = files.filter((file) => !matchesAnyGlob(file.path, config.ignore));
  const repoContext = buildRepositoryContext(root, filtered, config);
  let candidates = [...patternCandidates(filtered,{maxCandidates:config.maxCandidates}), ...diffRegressionCandidates(filtered), ...repositoryAwareCandidates(repoContext, filtered)];
  candidates = dedupeCandidates(candidates).filter((item)=>config.categories[item.category]!==false).slice(0,config.maxCandidates);
  const verification = await verifyCandidates(candidates,(candidate)=>contextForCandidate(repoContext,candidate,config),config);
  const findings=verification.findings;
  return { version:VERSION, repository:{root,...repository,stack:repoContext.stack,languages:repoContext.languages}, scope, config:{failOn:config.failOn,confidence:config.confidence,verifier:config.verifier}, verifier:verification.provider, blocking:findings.some((f)=>isAtLeastSeverity(f.severity,config.failOn)), failOn:config.failOn, findings, signals:staticSignals(filtered), summary:summarize(filtered,findings,files.length), warnings:[] };
}

function applyOverrides(base, options) {
  const config = structuredClone(base);
  if (options.failOn) config.failOn = String(options.failOn).toLowerCase();
  if (options.verifier) config.verifier = options.verifier;
  if (options.noAi) config.verifier = "offline";
  if (Number.isFinite(options.confidence)) config.confidence = Number(options.confidence);
  if (Number.isInteger(options.maxFiles) && options.maxFiles > 0) config.maxFiles = options.maxFiles;
  if (Number.isInteger(options.maxCandidates) && options.maxCandidates > 0) config.maxCandidates = options.maxCandidates;
  return config;
}

function dedupeCandidates(candidates) {
  return dedupe(candidates, (item) => {
    const detector = item.detector || item.title;
    const family = /check-then-create|read-check-write|repo-no-unique-protection/.test(detector) ? "concurrency-race"
      : /auth-protection-removed|repo-sensitive-route-no-auth|allow-anonymous/.test(detector) ? "authorization-boundary"
      : detector;
    return `${item.file}:${item.startLine || 0}:${family}`;
  });
}

function summarize(files, findings, totalChangedFiles, ignoredFiles = 0) {
  const summary = { filesReviewed: files.length, totalChangedFiles, ignoredFiles, findings: findings.length, critical:0, high:0, medium:0, low:0, info:0 };
  for (const finding of findings) summary[finding.severity]++;
  return summary;
}
