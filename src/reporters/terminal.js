import { isAtLeastSeverity } from "../utils.js";

export function terminalReport(result, { color = process.stdout.isTTY && !process.env.NO_COLOR, verbose = false } = {}) {
  const c = color ? colors : plain;
  const lines = [];
  lines.push(`${c.bold("MergeGuard")}  ${c.dim(result.scope.label)}`);
  lines.push(`${result.summary.filesReviewed} changed file${result.summary.filesReviewed === 1 ? "" : "s"} reviewed${result.summary.ignoredFiles ? ` · ${result.summary.ignoredFiles} ignored` : ""} · verifier: ${result.verifier}`);
  if (result.warnings.length) for (const warning of result.warnings) lines.push(c.yellow(`warning: ${warning}`));
  lines.push("");

  if (!result.findings.length) {
    lines.push(c.green("✓ No reportable issues found."));
  } else {
    for (const finding of result.findings) {
      const sev = severityLabel(finding.severity, c);
      const location = `${finding.file}${finding.startLine ? `:${finding.startLine}` : ""}`;
      lines.push(`${sev}  ${c.bold(location)}`);
      lines.push(c.bold(finding.title));
      lines.push(finding.description);
      if (finding.evidence?.[0]) lines.push(`${c.dim("Evidence:")} ${finding.evidence[0]}`);
      if (finding.remediation) lines.push(`${c.dim("Fix:")} ${finding.remediation}`);
      lines.push(`${c.dim("Confidence:")} ${Math.round(finding.confidence * 100)}% · ${c.dim("verified by:")} ${finding.verification.provider}`);
      if (verbose) {
        const v = finding.verification;
        lines.push(c.dim(`plausible=${v.plausible} reachable=${v.reachable} impact=${v.impact} protection=${v.existingProtection} report=${v.worthReporting}`));
      }
      lines.push("");
    }
  }

  const parts = ["critical", "high", "medium", "low", "info"].filter((s) => result.summary[s]).map((s) => `${result.summary[s]} ${s}`);
  if (parts.length) lines.push(parts.join(" · "));
  if (result.blocking) lines.push(c.red(c.bold(`BLOCKED — finding at or above '${result.failOn}' threshold.`)));
  else lines.push(c.green(c.bold("PASS")));
  return lines.join("\n");
}

function severityLabel(severity, c) {
  const text = severity.toUpperCase().padEnd(8);
  if (severity === "critical" || severity === "high") return c.red(text);
  if (severity === "medium") return c.yellow(text);
  if (severity === "low") return c.cyan(text);
  return c.dim(text);
}

const wrap = (code) => (text) => `\x1b[${code}m${text}\x1b[0m`;
const colors = { bold: wrap(1), dim: wrap(2), red: wrap(31), green: wrap(32), yellow: wrap(33), cyan: wrap(36) };
const plain = { bold: String, dim: String, red: String, green: String, yellow: String, cyan: String };
