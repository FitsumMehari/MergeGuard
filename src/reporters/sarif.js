const INFORMATION_URI = "https://github.com/FitsumMehari/MergeGuard";

export function toSarif(result) {
  const rules = new Map();
  for (const finding of result.findings) {
    const id = finding.detector || finding.id;
    if (!rules.has(id)) {
      rules.set(id, {
        id,
        name: String(id).replace(/[^A-Za-z0-9_-]/g, "-"),
        shortDescription: { text: finding.title },
        fullDescription: { text: finding.description },
        help: { text: finding.remediation || finding.description },
        defaultConfiguration: { level: sarifLevel(finding.severity) },
        properties: { category: finding.category, severity: finding.severity, tags: [finding.category, finding.severity] },
      });
    }
  }
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "MergeGuard",
          version: result.version,
          informationUri: INFORMATION_URI,
          rules: [...rules.values()],
        },
      },
      results: result.findings.map((finding) => ({
        ruleId: finding.detector || finding.id,
        level: sarifLevel(finding.severity),
        message: { text: `${finding.title}: ${finding.description}${finding.remediation ? ` Fix: ${finding.remediation}` : ""}` },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: finding.file.replaceAll("\\", "/") },
            region: { startLine: finding.startLine || 1, ...(finding.endLine ? { endLine: finding.endLine } : {}) },
          },
        }],
        partialFingerprints: { mergeguardFindingId: finding.id },
        properties: {
          category: finding.category,
          severity: finding.severity,
          confidence: finding.confidence,
          verifier: finding.verification?.provider,
        },
      })),
    }],
  };
}

function sarifLevel(severity) {
  return severity === "critical" || severity === "high" ? "error" : severity === "medium" ? "warning" : "note";
}
