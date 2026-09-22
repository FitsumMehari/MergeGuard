# Architecture

## Services

MergeGuard is split into three application services:

### API

Responsibilities:

- receive GitHub/GitLab webhooks;
- validate signatures/tokens;
- normalize/deduplicate deliveries;
- enqueue analysis jobs;
- expose authenticated dashboard/read APIs;
- expose liveness/readiness endpoints.

The API should not perform the full review inside the webhook request.

### Worker

Responsibilities:

- fetch PR/MR metadata and changed files;
- build/load repository intelligence;
- run detectors and AST analysis;
- select relevant repository context;
- call Jev for structured verification;
- persist analysis/finding results;
- publish GitHub/GitLab results.

### Web

Responsibilities:

- review history/dashboard;
- repository/index inspection;
- human-facing analysis display.

## Data services

### PostgreSQL

Stores durable application state, including:

- repositories/installations;
- change requests;
- analysis runs;
- findings/decisions;
- webhook audit metadata;
- repository-index snapshots.

Repository indexes are keyed by base SHA so several pushes to one PR/MR can reuse architecture discovery.

### Redis/BullMQ

Stores review jobs and retry state. The job identity includes repository/change/head SHA to reduce duplicate analysis caused by repeated provider events.

## Project Brain / Repository Intelligence

The repository model is a set of structured facts rather than a raw source-code dump. Current facts include:

```text
workspace/packages
applications/frameworks
import graph
reverse-import graph
Nest routes/guards
Prisma models/constraints
DB technology indicators
Redis/BullMQ indicators
Docker/Compose services/ports
Nginx upstreams/ports
tenant-scope conventions
```

The worker builds this on first use for a base SHA, then overlays changed files for the current head.

## Review pipeline

```text
Change request
   ↓
Normalized files + diff
   ↓
Repository model / relevant subgraph
   ↓
Deterministic + AST detectors
   ↓
Candidate findings
   ↓
Evidence enrichment
   ↓
Jev structured verification
   ↓
Confidence/noise filtering
   ↓
Risk aggregation
   ↓
Publisher
```

## Why Jev is not the detector

Jev is used where semantic judgment is ambiguous. Deterministic code should answer questions that can be proven mechanically.

Example:

```text
AST proves: database call exists inside loop
Jev judges: is this collection plausibly unbounded and important enough to report?
```

This design keeps the review explainable and reduces unnecessary AI usage.

## Idempotency

Reliability is designed at multiple layers:

- webhook signatures/tokens are validated;
- queue jobs are keyed to provider/repository/change/head;
- transient provider failures use bounded retries/backoff;
- analysis runs are unique per change-request/head SHA in the database;
- repository indexes are reusable by base SHA.

## Trust boundaries

Repository content is untrusted input. Code comments, strings and filenames must never be interpreted as control instructions for privileged actions. Jev receives structured state/questions; its outputs are validated before influencing the review result.
