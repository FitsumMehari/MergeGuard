# Features

## Repository-aware review

MergeGuard does not review a changed file in isolation. It builds and caches a repository model keyed by the PR/MR base SHA, then overlays the changed files for the current head. This lets findings use surrounding evidence such as imports, guards, database constraints, framework conventions and infrastructure relationships.

Current repository facts include:

- workspace/monorepo packages;
- detected applications and frameworks;
- import and reverse-import relationships;
- NestJS controllers, routes and visible guards;
- Next.js route-handler presence and application boundaries;
- Prisma models, fields, indexes and unique constraints;
- PostgreSQL/MariaDB indicators;
- Redis/ioredis/BullMQ usage;
- Docker/Docker Compose service information;
- Nginx upstreams and ports;
- common tenant-scope fields such as `tenantId`, `organizationId` and `workspaceId`.

## Detector families

The current deterministic engine contains 54+ checks. Representative categories include:

### Correctness and edge cases

- async `forEach` mistakes;
- unsafe non-null assertions;
- swallowed exceptions;
- missing/weak error handling candidates;
- unsafe assumptions around nullable values;
- retry/idempotency hazards;
- check-then-create and read-check-write races.

### Security

- interpolated/raw SQL candidates;
- dynamic execution / command execution sinks;
- path-traversal candidates;
- HTML injection sinks;
- JWT decode-without-obvious-verification patterns;
- TLS verification disabled;
- sensitive data logging;
- repository-aware missing-route-protection candidates;
- repository-aware tenant-isolation anomalies.

### Performance and scalability

- N+1/sequential I/O patterns;
- unbounded `Promise.all` candidates;
- synchronous Node.js I/O in request paths;
- unbounded collection growth;
- missing/bad pagination candidates;
- excessive branching/deep nesting signals.

### Database and migrations

- destructive migration statements;
- unsafe `NOT NULL` migration candidates;
- missing transaction candidates;
- race conditions around uniqueness/creation;
- repository evidence from Prisma indexes/constraints.

### Infrastructure

- Docker/Nginx/application port mismatches;
- risky TLS/configuration patterns when recognized;
- infrastructure changes included in blast-radius/risk analysis.

## Jev verification

Detectors create **candidates**, not unquestionable claims. Ambiguous candidates are passed to Jev using structured question types. The verifier asks questions such as:

- Is the issue plausible given the supplied evidence?
- Is the path likely reachable?
- Is there already visible protection?
- What is the likely impact?
- Is the issue important enough to interrupt the developer?

Jev is the only AI provider. There is no OpenAI, Anthropic or Gemini runtime dependency.

## Findings

A finding contains structured information such as:

- category;
- severity;
- confidence;
- file and line range;
- title and explanation;
- evidence;
- repository facts used in the judgment;
- possible execution path or edge case;
- remediation guidance when a safe generic suggestion exists;
- verifier decision metadata.

## Risk

PR/MR risk is derived from the reported findings and repository-impact signals. It is not an unexplained single-model score.

Risk levels are intended to answer: **how much review attention does this change deserve?** They are not a proof that the code is incorrect.

## Noise control

MergeGuard favors precision over volume. Low-confidence candidates can be suppressed rather than posted. This is especially important for architecture, maintainability and framework-convention findings where repository context may be incomplete.
