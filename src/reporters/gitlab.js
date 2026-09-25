export function toGitLabCodeQuality(result) {
  return result.findings.map((finding) => ({
    description: `${finding.title}: ${finding.description}`,
    check_name: finding.detector || "mergeguard",
    fingerprint: finding.id,
    severity: mapSeverity(finding.severity),
    location: { path: finding.file, lines: { begin: finding.startLine || 1, end: finding.endLine || finding.startLine || 1 } },
  }));
}
function mapSeverity(severity) { return { critical:"blocker", high:"critical", medium:"major", low:"minor", info:"info" }[severity] || "major"; }
