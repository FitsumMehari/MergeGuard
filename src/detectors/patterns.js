import { languageForPath } from "../languages.js";
import { dedupe, stableId, truncate } from "../utils.js";

const rules = [
  rule("dynamic-eval", /\b(?:eval|exec)\s*\(/gi, ["javascript","typescript","python","php","ruby"], "security", "critical", "Dynamic code execution introduced", "Dynamic evaluation can execute attacker-controlled text as code.", "Avoid dynamic evaluation. Parse or map explicitly allowed operations instead.", 0.90),
  rule("js-shell-interpolation", /(?:exec|execSync)\s*\(\s*`[^`]*\$\{|(?:exec|execSync)\s*\([^)]*(?:req\.|request\.|params|query|body)/gi, ["javascript","typescript"], "security", "critical", "Potential command injection", "A shell command appears to include dynamic or request-controlled input.", "Use execFile/spawn with an argument array and strict allow-list validation.", 0.91),
  rule("python-shell-true", /subprocess\.(?:run|Popen|call|check_output|check_call)\s*\([^\n]{0,500}?shell\s*=\s*True/gi, ["python"], "security", "high", "Shell execution enabled", "Python subprocess is invoked with shell=True, which can turn interpolated input into shell injection.", "Pass an argument list with shell=False and validate any dynamic arguments.", 0.86),
  rule("php-shell", /\b(?:shell_exec|passthru|system|exec)\s*\([^\n]*(?:\$\w+|\$_(?:GET|POST|REQUEST))/gi, ["php"], "security", "critical", "Potential command injection", "A PHP shell execution call appears to include variable or request input.", "Avoid shell execution or pass strictly validated allow-listed arguments.", 0.90),
  rule("java-process-exec", /(?:Runtime\.getRuntime\(\)\.exec|new\s+ProcessBuilder)\s*\([^\n]*(?:\+|String\.format|request\.|getParameter)/gi, ["java","kotlin"], "security", "high", "Dynamic process execution", "A process command appears to be assembled from dynamic input.", "Use a fixed executable plus separately validated argument values; avoid invoking a shell.", 0.82),
  rule("go-shell-command", /exec\.Command\s*\(\s*["'](?:sh|bash)["']\s*,\s*["']-c["']\s*,[^\n]*(?:fmt\.Sprintf|\+)/gi, ["go"], "security", "critical", "Shell command built dynamically", "Go executes a shell with a dynamically assembled command string.", "Invoke the executable directly with exec.Command(name, args...) and validate dynamic arguments.", 0.90),
  rule("ruby-shell-interpolation", /(?:system|exec)\s*\([^\n]*#\{|`[^`]*#\{/gi, ["ruby"], "security", "critical", "Potential shell injection", "A Ruby shell command contains string interpolation.", "Use argument-array process APIs and strictly validate dynamic values.", 0.89),
  rule("csharp-process", /Process\.Start\s*\([^\n]*(?:\$["']|\+\s*\w+|Request\.)/gi, ["csharp"], "security", "high", "Dynamic process execution", "A process launch appears to include dynamically assembled input.", "Use ProcessStartInfo.ArgumentList or separately validated arguments without shell parsing.", 0.84),
  rule("tls-disabled", /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|ServerCertificateCustomValidationCallback\s*=\s*[^;]*(?:=>\s*true|return\s+true)/gi, null, "security", "critical", "TLS certificate verification disabled", "Certificate verification is explicitly disabled, enabling man-in-the-middle attacks.", "Keep certificate verification enabled and configure trusted CA certificates correctly.", 0.98),
  rule("unsafe-sql", /\$queryRawUnsafe|\$executeRawUnsafe|(?:SELECT|INSERT|UPDATE|DELETE)[^\n]{0,400}(?:\$\{|\+\s*\w+|f["']|%\s*\w+)|(?:execute|query)\s*\(\s*f["'][^\n]*\{|Statement\.execute(?:Query|Update)?\s*\([^\n]*\+/gi, null, "security", "critical", "Potential SQL injection", "SQL appears to be assembled dynamically rather than bound as parameters.", "Use parameterized queries or safe query builders; validate dynamic identifiers separately.", 0.88),
  rule("html-injection", /dangerouslySetInnerHTML|\.innerHTML\s*=|v-html\s*=|\{!\!\s*html_safe/gi, null, "security", "high", "Raw HTML injection sink", "Raw HTML rendering can become XSS when content is user-controlled.", "Render text normally or sanitize HTML with a well-tested sanitizer before the sink.", 0.78),
  rule("path-traversal", /(?:readFile|writeFile|createReadStream|createWriteStream|sendFile|unlink|rm|open)\s*\([^\n]{0,300}(?:req\.|request\.|params|query|body|\$_GET|\$_POST)/gi, null, "security", "high", "Request-controlled filesystem path", "A filesystem operation appears to use request-controlled path data.", "Resolve against a fixed root and reject paths that escape it; prefer opaque file identifiers.", 0.77),
  rule("cors-wildcard", /(?:Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|origin\s*:\s*["']\*["']|allow_origins\s*=\s*\[["']\*["']\])/gi, null, "security", "medium", "Wildcard CORS policy", "The changed CORS policy permits arbitrary origins.", "Allow-list trusted origins and review credential behavior.", 0.74),
  rule("sensitive-log", /(?:console\.(?:log|info|debug|warn)|logger\.(?:info|debug|warn)|print\s*\()[^\n]{0,300}(?:password|passwd|token|secret|authorization|cookie|api[_-]?key)/gi, null, "security", "high", "Possible credential data written to logs", "Credential-like data appears in a log statement.", "Remove or redact the sensitive value before logging.", 0.80),
  rule("python-pickle", /\bpickle\.(?:loads?|Unpickler)\s*\(/gi, ["python"], "security", "high", "Python pickle deserialization", "Pickle can execute arbitrary code when loading untrusted data.", "Use a safe serialization format for untrusted input or strictly constrain the data source.", 0.80),
  rule("python-yaml-load", /yaml\.load\s*\([^\n]*(?!SafeLoader)/gi, ["python"], "security", "high", "Potential unsafe YAML deserialization", "yaml.load without an explicit safe loader can construct unsafe Python objects.", "Use yaml.safe_load or SafeLoader for untrusted YAML.", 0.77),
  rule("php-unserialize", /\bunserialize\s*\([^\n]*(?:\$\w+|\$_(?:GET|POST|REQUEST))/gi, ["php"], "security", "high", "Untrusted PHP deserialization", "PHP unserialize on request-derived data can enable object injection.", "Use JSON or a safe typed format for untrusted input.", 0.86),
  rule("java-deserialization", /ObjectInputStream[\s\S]{0,350}?\.readObject\s*\(/gi, ["java"], "security", "high", "Java native deserialization", "ObjectInputStream can instantiate attacker-controlled object graphs when its source is untrusted.", "Use a constrained serialization format and explicit schema for untrusted data.", 0.72),
  rule("dotnet-binaryformatter", /BinaryFormatter[\s\S]{0,300}?\.Deserialize\s*\(/gi, ["csharp"], "security", "critical", "Unsafe .NET BinaryFormatter deserialization", "BinaryFormatter is unsafe for untrusted data and can lead to code execution.", "Replace BinaryFormatter with a safe serializer and explicit data contracts.", 0.96),
  rule("ruby-marshal", /Marshal\.load\s*\([^\n]*(?:params|request|cookies|\w+)/gi, ["ruby"], "security", "high", "Ruby Marshal deserialization", "Marshal.load can instantiate arbitrary objects and is unsafe for untrusted data.", "Use JSON or another constrained serialization format for external data.", 0.75),
  rule("jwt-decode-only", /(?:jwt\.decode|decodeJwt|JWT\.decode)\s*\(/gi, null, "authorization", "high", "JWT decoded without visible verification", "Decoding token claims is not equivalent to validating the signature and trusted claims.", "Verify signature, algorithm, issuer, audience, and expiry before trusting claims.", 0.70),
  rule("open-redirect", /(?:redirect|Redirect|location\.(?:href|assign))\s*\([^\n]*(?:req\.|request\.|params|query|returnUrl|next=)/gi, null, "security", "medium", "Potential open redirect", "A redirect target appears influenced by request input.", "Allow-list destinations or map opaque route identifiers to internal URLs.", 0.67),
  rule("async-foreach", /\.forEach\s*\(\s*async\b/gi, ["javascript","typescript"], "correctness", "high", "Async callback passed to forEach", "forEach does not await async callbacks, so the surrounding flow can finish before side effects complete.", "Use for...of for sequential work or await Promise.all(items.map(...)) when parallelism is safe.", 0.95),
  rule("floating-promise", /(?:^|\n)\s*(?:fetch|axios\.|[A-Za-z_$][\w$]*Async\s*\()[^;\n]*;\s*(?:\n|$)/g, ["javascript","typescript"], "reliability", "medium", "Possible unawaited asynchronous operation", "A promise-returning operation appears to be started without await/return/handling.", "Await, return, or explicitly handle the promise and its rejection.", 0.58),
  rule("empty-catch", /catch\s*(?:\([^)]*\))?\s*\{\s*\}/gi, ["javascript","typescript","java","kotlin","csharp"], "reliability", "medium", "Exception silently swallowed", "An empty catch block can hide a failed operation and leave state inconsistent.", "Handle the failure, convert it intentionally, or document and instrument a deliberate ignore.", 0.85),
  rule("python-bare-except", /except\s*(?:Exception)?\s*:\s*(?:pass|continue)\b/gi, ["python"], "reliability", "medium", "Exception silently swallowed", "The exception path is ignored without reporting or recovery.", "Catch only expected exceptions and handle or record the failure explicitly.", 0.81),
  rule("check-then-create", /(?:findUnique|findFirst|findOne|findOneBy|exists|count|get_or_none|filter\([^\n]*\)\.first|SELECT)[\s\S]{0,900}?(?:create|save|insert|INSERT)\s*\(/gi, null, "concurrency", "high", "Check-then-create race candidate", "A pre-check followed by create/insert can race when two requests execute concurrently.", "Enforce the invariant at the database boundary with a unique constraint/upsert/transaction and handle conflicts.", 0.73),
  rule("read-check-write", /(?:findUnique|findFirst|findOne|findOneBy|SELECT|\.get\s*\()[\s\S]{0,900}?if\s*\([\s\S]{0,500}?(?:update|save|write|delete|create)\s*\(/gi, null, "concurrency", "high", "Read-check-write race candidate", "State is read, checked, and later mutated without an obvious atomic operation in the changed code.", "Use a conditional atomic update, transaction/lock, unique constraint, or idempotency key as appropriate.", 0.67),
  rule("multiple-writes", /(?:\.create|\.update|\.delete|\.save|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM)[\s\S]{0,1000}?(?:\.create|\.update|\.delete|\.save|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM)/gi, null, "database", "medium", "Multiple persistent writes without obvious transaction", "Several writes appear in one changed flow without an obvious transaction boundary.", "Use a transaction when these writes must succeed or fail as one business operation.", 0.61),
  rule("unbounded-delete", /deleteMany\s*\(\s*(?:\{\s*(?:where\s*:\s*\{\s*\})?\s*\})?\s*\)|DELETE\s+FROM\s+[\w."`]+\s*;|\.delete\s*\(\s*\{?\s*\}?\s*\)/gi, null, "database", "critical", "Potential unbounded delete", "A delete operation appears to lack a restrictive predicate.", "Require and validate a specific predicate; reject empty filters.", 0.92),
  rule("broad-update", /updateMany\s*\(\s*\{[\s\S]{0,350}?where\s*:\s*\{\s*\}/gi, null, "database", "high", "Potential broad database update", "An updateMany operation contains an empty filter.", "Require a specific validated predicate and test that empty filters are rejected.", 0.90),
  rule("n-plus-one", /(?:for\s*\(|for\s+\w+\s+in\s+|\.map\s*\()[\s\S]{0,700}?(?:findUnique|findFirst|findOne|\.query\s*\(|\.execute\s*\(|SELECT\s+)/gi, null, "performance", "medium", "Database query inside a loop", "The changed flow appears to issue a database query per iteration, which can become an N+1 query pattern.", "Batch/load related records once, join/preload them, or use a bounded bulk query.", 0.72),
  rule("unbounded-parallelism", /Promise\.all\s*\(\s*[^\n]{0,120}\.map\s*\(\s*async/gi, ["javascript","typescript"], "performance", "medium", "Potential unbounded async fan-out", "Promise.all over an arbitrary collection can overwhelm databases or remote APIs.", "Use bounded concurrency when the collection can grow with user/data size.", 0.64),
  rule("destructive-migration", /\bDROP\s+(?:COLUMN|TABLE|INDEX)\b/gi, ["sql"], "database", "high", "Destructive schema migration", "The migration removes a schema object and may break rolling deployments or destroy data.", "Use expand/contract deployment, migrate data first, and verify old application versions no longer depend on it.", 0.90),
  rule("not-null-migration", /\bADD\s+(?:COLUMN\s+)?[\w"`]+\s+[^;\n]+NOT\s+NULL(?![^;\n]{0,120}\bDEFAULT\b)/gi, ["sql"], "database", "high", "NOT NULL column added without default/backfill", "Adding a required column can fail or block when existing rows lack a value.", "Use a staged nullable/default + backfill + constraint migration.", 0.83),
  rule("blocking-index", /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/gi, ["sql"], "database", "medium", "Index creation may block writes", "On large PostgreSQL tables, non-concurrent index creation can block production writes.", "Consider CREATE INDEX CONCURRENTLY where supported and operationally appropriate.", 0.64),
  rule("hardcoded-localhost", /["']https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/gi, null, "reliability", "low", "Hard-coded local service endpoint", "A localhost URL in application code often fails in containers, CI, or deployment.", "Move environment-specific endpoints into validated configuration.", 0.67),
  rule("retry-no-delay", /(?:while|for)\s*\([^)]*\)[\s\S]{0,500}?(?:catch|except)[\s\S]{0,220}?(?:continue|retry)(?![\s\S]{0,200}?(?:sleep|delay|backoff))/gi, null, "reliability", "medium", "Retry loop without obvious backoff", "Immediate retries can amplify outages and rate limits.", "Use bounded retries with exponential backoff, jitter, and retryable-error classification.", 0.62),
  rule("allow-anonymous", /@Public\s*\(\)|\[AllowAnonymous\]|permitAll\s*\(\)/gi, null, "authorization", "high", "Authentication bypass introduced", "The changed code marks a route or operation as public/anonymous.", "Confirm the operation is intentionally public and cannot expose or mutate protected resources.", 0.68),
];

export function patternCandidates(files, { maxCandidates = 120 } = {}) {
  const output = [];
  for (const file of files) {
    if (file.status === "deleted" || !file.patch) continue;
    const language = languageForPath(file.path);
    const added = addedText(file.patch);
    if (!added.trim()) continue;
    for (const item of rules) {
      if (item.languages && !item.languages.includes(language)) continue;
      const regex = new RegExp(item.regex.source, item.regex.flags.includes("g") ? item.regex.flags : `${item.regex.flags}g`);
      let count = 0;
      for (const match of added.matchAll(regex)) {
        if (count++ >= 6) break;
        const line = lineFromAddedOffset(file.patch, match.index ?? 0) ?? firstAddedLine(file.patch);
        output.push({
          id: stableId([file.path, item.id, String(line ?? match.index ?? 0)]),
          detector: item.id,
          category: item.category,
          severity: item.severity,
          title: item.title,
          description: item.description,
          remediation: item.remediation,
          file: file.path,
          startLine: line,
          evidence: [truncate(snippet(added, match.index ?? 0), 700)],
          reviewerConfidence: item.confidence,
          language,
        });
      }
    }
  }
  return dedupe(output, (item) => `${item.file}:${item.startLine || 0}:${item.detector}`).slice(0, maxCandidates);
}

export function diffRegressionCandidates(files) {
  const out = [];
  for (const file of files) {
    const patch = file.patch || "";
    const removed = removedText(patch);
    const added = addedText(patch);
    const language = languageForPath(file.path);
    if (/UseGuards|Authorize|PreAuthorize|Secured|RequireRole|requireAuth|authenticate|authorization|permission|policy/i.test(removed) && !/UseGuards|Authorize|PreAuthorize|Secured|RequireRole|requireAuth|authenticate|authorization|permission|policy/i.test(added)) {
      out.push(regression(file, "auth-protection-removed", "authorization", "high", "Authorization protection removed", "The diff removes an authentication/authorization guard or policy marker without an obvious replacement in the added lines.", "Restore equivalent protection or document why this operation is intentionally public.", 0.84, removed));
    }
    if (/\b(?:tenantId|organizationId|orgId|workspaceId|companyId|accountId|ownerId)\b/i.test(removed) && /(?:find|select|update|delete|where|query)/i.test(`${removed}\n${added}`)) {
      out.push(regression(file, "tenant-filter-removed", "tenant-isolation", "critical", "Tenant or ownership constraint removed", "A tenant/organization/owner field is removed from a data-access change, which may broaden access across isolation boundaries.", "Keep tenant/ownership predicates on reads and writes unless another proven isolation boundary replaces them.", 0.87, removed));
    }
    if (/\b(?:transaction|\$transaction|atomic|BeginTransaction|@Transactional|BEGIN\s+TRANSACTION)\b/i.test(removed) && countWrites(added) >= 2) {
      out.push(regression(file, "transaction-boundary-removed", "database", "high", "Transaction boundary removed while multiple writes remain", "The diff removes transaction handling but still performs multiple persistent writes.", "Keep the writes atomic or explicitly handle partial-success compensation.", 0.88, removed));
    }
    if (/\b(?:UNIQUE|@unique|unique\s*:\s*true|unique_together|UniqueConstraint)\b/i.test(removed)) {
      out.push(regression(file, "uniqueness-removed", "database", "high", "Database uniqueness protection removed", "The diff removes a uniqueness constraint or unique index, which can invalidate application-level assumptions under concurrency.", "Keep the invariant enforced by the database or migrate callers to a different explicit invariant.", 0.86, removed));
    }
    if (/validate|schema\.parse|safeParse|class-validator|@Valid|ModelState\.IsValid/i.test(removed) && /(req\.|request\.|body|params|input|payload|dto)/i.test(`${removed}\n${added}`)) {
      out.push(regression(file, "validation-removed", "correctness", "high", "Input validation removed", "Validation on externally supplied input is removed without an obvious replacement.", "Restore schema/boundary validation or enforce equivalent constraints before the data is used.", 0.75, removed));
    }
    if (language === "sql" && /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(removed) && /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/i.test(added)) {
      out.push(regression(file, "concurrent-index-removed", "database", "medium", "Concurrent index creation removed", "The migration changes to a potentially blocking index build.", "Use a non-blocking migration strategy appropriate for the production database and table size.", 0.82, added));
    }
  }
  return dedupe(out, (item) => `${item.file}:${item.detector}`);
}

export function staticSignals(files) {
  const signals = [];
  const totalAdded = files.reduce((sum, file) => sum + (file.additions || 0), 0);
  if (files.length > 40 || totalAdded > 1500) signals.push({ id: "large-change", severity: "medium", category: "correctness", title: "Large change surface", description: `${files.length} files / ${totalAdded} added lines increase hidden-interaction risk.` });
  for (const file of files) {
    if (/(migration|migrations|schema\.prisma|\.sql$|entity\.|models?\/)/i.test(file.path)) signals.push({ id: stableId([file.path,"db"]), file: file.path, severity: "high", category: "database", title: "Database-sensitive file changed", description: file.path });
    if (/(auth|oauth|jwt|session|permission|rbac|acl|guard|policy)/i.test(file.path)) signals.push({ id: stableId([file.path,"auth"]), file: file.path, severity: "high", category: "authorization", title: "Authorization-sensitive file changed", description: file.path });
    if (/(\.github\/workflows|\.gitlab-ci|Dockerfile|terraform|k8s|helm)/i.test(file.path)) signals.push({ id: stableId([file.path,"infra"]), file: file.path, severity: "medium", category: "reliability", title: "Delivery/infrastructure file changed", description: file.path });
  }
  return dedupe(signals, (item) => item.id);
}

function rule(id, regex, languages, category, severity, title, description, remediation, confidence, needle) {
  return { id, regex, languages, category, severity, title, description, remediation, confidence, needle };
}

function regression(file, detector, category, severity, title, description, remediation, reviewerConfidence, evidence) {
  const startLine = firstAddedLine(file.patch) || undefined;
  return { id: stableId([file.path, detector]), detector, category, severity, title, description, remediation, file: file.path, startLine, evidence: [truncate(evidence.replace(/\s+/g," ").trim(), 700)], reviewerConfidence, language: languageForPath(file.path) };
}

export function addedText(patch = "") {
  return patch.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1)).join("\n");
}

export function removedText(patch = "") {
  return patch.split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---")).map((line) => line.slice(1)).join("\n");
}

export function lineFromAddedOffset(patch = "", offset = 0) {
  let lineNumber = 0;
  let seen = 0;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { lineNumber = Number(hunk[1]); continue; }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const length = line.slice(1).length + 1;
      if (seen + length > offset) return lineNumber;
      seen += length;
      lineNumber++;
    } else if (!line.startsWith("-")) lineNumber++;
  }
  return undefined;
}

export function lineFromPatch(patch = "", needle = "") {
  let lineNumber = 0;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { lineNumber = Number(hunk[1]); continue; }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (!needle || line.includes(needle)) return lineNumber;
      lineNumber++;
    } else if (!line.startsWith("-")) lineNumber++;
  }
  return undefined;
}

function firstAddedLine(patch = "") { return lineFromPatch(patch, ""); }
function countWrites(text) { return (text.match(/(?:\.create|\.update|\.delete|\.save|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM)/gi) || []).length; }
function snippet(text, index, radius = 350) { return text.slice(Math.max(0,index-120), Math.min(text.length,index+radius)).replace(/\s+/g," ").trim(); }
