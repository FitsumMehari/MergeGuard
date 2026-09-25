import { terminalReport } from "./terminal.js";
import { toSarif } from "./sarif.js";
import { toGitLabCodeQuality } from "./gitlab.js";

export function renderReport(result, format = "terminal", options = {}) {
  if (format === "terminal") return terminalReport(result, options);
  if (format === "json") return JSON.stringify(result, null, 2);
  if (format === "sarif") return JSON.stringify(toSarif(result), null, 2);
  if (format === "gitlab") return JSON.stringify(toGitLabCodeQuality(result), null, 2);
  throw new Error(`Unknown output format '${format}'. Use terminal, json, sarif, or gitlab.`);
}
export { toSarif } from "./sarif.js";
export { toGitLabCodeQuality } from "./gitlab.js";
