import { addedText } from "./patterns.js";
import { dedupe, stableId, truncate } from "../utils.js";

export function repositoryAwareCandidates(repoContext, files) {
  const out = [];
  for (const file of files) {
    if (file.status === "deleted") continue;
    const content = file.headContent || "";
    const added = addedText(file.patch || "");

    if (repoContext.tenantFields.length && /(findMany|findFirst|findUnique|findOne|SELECT|UPDATE|DELETE|\.where\s*\()/i.test(added)) {
      const hasTenant = repoContext.tenantFields.some((field) => new RegExp(`\\b${field}\\b`).test(added));
      const likelyDataAccess = /repository|service|dao|store|model|entity|db|database/i.test(file.path) || repoContext.stack.orm.length > 0;
      if (!hasTenant && likelyDataAccess) {
        out.push(candidate(file, "repo-missing-tenant", "tenant-isolation", "high", "Data access may omit repository tenant boundary", `This repository uses tenant/organization fields (${repoContext.tenantFields.join(", ")}), but the changed data-access expression does not visibly include one.`, "Constrain the operation by the current tenant/organization unless isolation is guaranteed by another concrete mechanism.", 0.61, added));
      }
    }

    if (repoContext.authMarkers.length && looksLikeSensitiveEndpoint(added, content) && !hasAuthMarkerNearChange(added)) {
      const hasGlobal = /APP_GUARD|global.*guard|UseAuthentication|UseAuthorization|app\.use\([^)]*auth/i.test([...repoContext.files.values()].join("\n"));
      if (!hasGlobal) {
        out.push(candidate(file, "repo-sensitive-route-no-auth", "authorization", "high", "Sensitive route has no visible authorization marker", "The changed route mutates or exposes a resource while this repository uses explicit authorization markers elsewhere.", "Apply the repository's normal authentication/authorization mechanism or prove a global policy covers this route.", 0.60, added));
      }
    }

    if (/webhook|callback/i.test(file.path + "\n" + added) && /(activate|credit|charge|payment|subscription|fulfill|ship|create|update)/i.test(added) && !/idempotenc|deduplicat|event[_-]?id|processed|upsert|ON\s+CONFLICT/i.test(`${added}\n${content}`)) {
      out.push(candidate(file, "repo-webhook-idempotency", "concurrency", "high", "Webhook side effect may not be idempotent", "The changed webhook/callback performs a persistent business side effect without visible replay/deduplication protection.", "Persist and atomically claim a provider event/idempotency key before applying side effects.", 0.67, added));
    }

    if ((/check-then-create|read-check-write/.test("") || /findUnique|findFirst|exists|count/.test(added)) && /(create|insert|save)/i.test(added)) {
      const uniqueShown = /@unique|unique\s*:\s*true|UNIQUE|UniqueConstraint|unique_together/i.test([...repoContext.files.values()].join("\n"));
      if (!uniqueShown && repoContext.stack.orm.length) {
        out.push(candidate(file, "repo-no-unique-protection", "concurrency", "high", "Application pre-check lacks visible database uniqueness protection", "The change appears to check before creating data, while the sampled repository schema does not show a uniqueness invariant that would close the race.", "Enforce the invariant in the database and handle the conflict atomically.", 0.70, added));
      }
    }
  }
  return dedupe(out, (item) => `${item.file}:${item.detector}`);
}

function candidate(file, detector, category, severity, title, description, remediation, reviewerConfidence, evidence) {
  return { id: stableId([file.path, detector]), detector, category, severity, title, description, remediation, file: file.path, startLine: firstAddedLine(file.patch), evidence: [truncate(evidence.replace(/\s+/g," ").trim(), 700)], reviewerConfidence };
}
function firstAddedLine(patch="") { const m=patch.match(/^@@ -\d+(?:,\d+)? \+(\d+)/m); return m?Number(m[1]):undefined; }
function looksLikeSensitiveEndpoint(text, content) { return /@(Post|Put|Patch|Delete|Get)|\b(app|router)\.(post|put|patch|delete|get)\s*\(|\[(HttpPost|HttpPut|HttpPatch|HttpDelete|HttpGet)\]|@(PostMapping|PutMapping|PatchMapping|DeleteMapping|GetMapping)|Route::(?:post|put|patch|delete|get)/i.test(text || content); }
function hasAuthMarkerNearChange(text) { return /UseGuards|Authorize|PreAuthorize|Secured|RequireRole|requireAuth|authenticate|permission|policy|middleware\(['"]auth|auth:/i.test(text); }
