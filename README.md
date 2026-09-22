# MergeGuard v1.1 — Jev-only, repository-aware PR/MR review

MergeGuard reviews **GitHub Pull Requests** and **GitLab Merge Requests** for bugs, security problems, concurrency hazards, database mistakes, performance/scalability risks, reliability issues and maintainability concerns.

**Jev is the only AI provider.** Everything else is deterministic/local analysis: TypeScript AST parsing, pattern detectors, repository indexing, framework/infra discovery, import graphs, database/schema extraction and risk aggregation.


## Documentation

Start with these guides:

- [Quick start](docs/QUICK_START.md)
- [GitLab setup](docs/GITLAB_SETUP.md)
- [GitHub setup](docs/GITHUB_SETUP.md)
- [First live test](docs/FIRST_LIVE_TEST.md)
- [Full documentation index](docs/README.md)

The project includes a full documentation set under [`docs/`](docs/README.md). Start with:

- [`docs/README.md`](docs/README.md) — documentation index
- [`docs/FEATURES.md`](docs/FEATURES.md) — supported features and detector families
- [`docs/USAGE.md`](docs/USAGE.md) — GitHub/GitLab workflow
- [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) — run the complete stack on your own server
- [`docs/EXAMPLES.md`](docs/EXAMPLES.md) — realistic review cases
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system internals and Project Brain
- [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) — runtime and repository configuration
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — operational/debugging guide

## How it works

```text
FIRST REVIEW AGAINST A BASE SHA
GitHub/GitLab repository
        ↓
repository tree + bounded source fetch
        ↓
Repository Intelligence index (cached in PostgreSQL)
        ├─ workspace / monorepo packages
        ├─ NestJS / Next.js detection
        ├─ import + reverse-import graph
        ├─ Nest routes + guards
        ├─ Prisma models / constraints / indexes
        ├─ PostgreSQL / MariaDB detection
        ├─ Redis/BullMQ detection
        └─ Docker / Compose / Nginx ports + upstreams

EVERY PR/MR UPDATE
changed files
        ↓
overlay changes onto cached base model
        ↓
local detectors + relevant repository subgraph
        ↓
Jev structured verification
        ↓
confidence filtering + risk aggregation
        ↓
GitHub Check / GitLab MR note + dashboard
```

The index is keyed by the **base commit SHA**, so repeated pushes to the same PR/MR reuse the same architecture model. Changed files are overlaid in memory before review, so newly added routes/configuration are still understood immediately.

## Stack support

The current repository-intelligence layer is designed primarily for the stack this project targets:

- TypeScript / JavaScript
- monorepos (pnpm, npm/yarn, Lerna, Nx, Turborepo, Nest)
- NestJS (controllers, WebSocket gateways, `APP_GUARD`, `@Public()`)
- Next.js App Router route handlers
- TypeORM entities and Prisma, plus generic Drizzle/SQL signals
- PostgreSQL and MariaDB/MySQL detection
- Redis / ioredis / BullMQ discovery
- Docker / Docker Compose
- Nginx

The core is not tied to those frameworks; unsupported files still participate in path/diff/static analysis when a detector understands them.

## Repository-aware examples

MergeGuard can reason with repository facts instead of reviewing isolated lines. Examples:

- A NestJS `/:id` route added without a visible guard in a repository that normally uses guards becomes an authorization candidate for Jev to verify.
- A repository that consistently uses `organizationId`/`tenantId` can flag a changed ORM query that appears to omit tenant scoping.
- Nginx upstream ports can be compared with application/Docker listener ports.
- Prisma unique constraints and indexes are included in the project model so Jev can suppress race/database warnings when a concrete protection exists.
- Import and reverse-import edges identify nearby files and likely blast radius without sending the entire monorepo to Jev.

## AI and cost model

Only this credential is used for AI:

```env
TYPESAFE_API_KEY=...
JEV_API_URL=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest
```

There is no OpenAI, Anthropic, Gemini, or other generative-AI fallback. If `TYPESAFE_API_KEY` is absent, deterministic detectors still work in a conservative offline mode for development/testing. In production set `REQUIRE_JEV=true` if semantic verification must never run without Jev. In production set `REQUIRE_JEV=true` if semantic verification must never run without Jev.

You still pay ordinary infrastructure costs for PostgreSQL, Redis and the API/worker/web services. Repository indexing consumes GitHub/GitLab API bandwidth and worker CPU/memory, but it does not call another AI service.

## Latency strategy

Repository understanding is deliberately **not rebuilt on every push**.

- First PR/MR against an unseen base SHA: bounded repository index build.
- Later pushes with the same base SHA: reuse the cached index and overlay only changed files.
- Jev calls are bounded with `JEV_CONCURRENCY`.
- Repository indexing limits file count, file size and fetch concurrency.
- Each finding receives repository facts plus relevant paths rather than the entire repository contents.

Tune these values for very large monorepos:

```env
INDEX_MAX_FILES=800
INDEX_MAX_FILE_BYTES=120000
INDEX_MAX_FILE_CHARS=120000
INDEX_FETCH_CONCURRENCY=12
INDEX_MAX_TREE_PAGES=80
MAX_RELATED_FILES=50
JEV_CONCURRENCY=6
```

## Detector families

The deterministic engine currently includes 54+ checks covering representative classes such as:

- async `forEach` / async control-flow mistakes
- check-then-create and read-check-write race candidates
- missing transaction candidates
- unsafe/interpolated SQL
- dynamic execution / shell execution
- HTML injection sinks / path traversal candidates
- JWT decode-without-obvious-verification
- TLS verification disabled
- sensitive logging
- N+1 / sequential I/O patterns
- unbounded `Promise.all`
- sync Node.js I/O
- unbounded collection growth / pagination risks
- destructive or unsafe migrations
- swallowed exceptions / retry hazards
- TypeScript non-null assertions / unsafe casts
- deep nesting / branch-heavy maintainability candidates

A detector creates a **candidate**, not a claim of proof. Jev then answers structured questions about plausibility, reachability, existing protection, impact and whether the issue is worth reporting.

## Requirements

- Node.js 22+
- pnpm 10+
- PostgreSQL
- Redis
- TypeSafe/Jev API key for semantic verification
- GitHub App credentials and/or GitLab token

## Quick start

```bash
cp .env.example .env
docker compose up -d
corepack enable
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm build
pnpm test:offline
```

Run:

```bash
pnpm --filter @mergeguard/api dev
pnpm --filter @mergeguard/worker dev
pnpm --filter @mergeguard/web dev
```

Dashboard: `http://localhost:3000`

For production, configure `DASHBOARD_API_KEY`, `DASHBOARD_USER`, and `DASHBOARD_PASSWORD`; the API and dashboard refuse unprotected production operation.

API liveness: `http://localhost:4000/health/live`

API readiness: `http://localhost:4000/health/ready`


## Production hardening in v1.1

The production-facing services now include:

- validated environment configuration and bounded numeric limits
- authenticated dashboard API plus dashboard Basic authentication
- distinct liveness/readiness probes
- BullMQ retry/backoff defaults
- PR/MR head-SHA job deduplication and DB-level analysis idempotency
- bounded HTTP timeouts/retries for GitHub/GitLab
- Jev request timeout
- graceful API/worker shutdown
- security-oriented response headers
- service-specific Dockerfiles for API, worker and web
- committed Prisma production migrations
- CI workflow for typecheck, offline tests and build

See `docs/DEPLOYMENT.md` for the recommended Railway production topology and exact service variables.

## GitHub App

Webhook URL:

```text
https://YOUR_API_HOST/webhooks/github
```

Subscribe to Pull Request events. MergeGuard handles `opened`, `reopened`, `synchronize`, and `ready_for_review`.

Typical permissions:

- Metadata: read
- Contents: read
- Pull requests: read
- Checks: write

Environment:

```env
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=
```

GitHub webhook HMAC validation uses the exact raw request body.

## GitLab

Webhook URL:

```text
https://YOUR_API_HOST/webhooks/gitlab
```

Enable merge request events and configure:

```env
GITLAB_BASE_URL=https://gitlab.com
GITLAB_TOKEN=
GITLAB_WEBHOOK_SECRET=
```

## Repository intelligence API

The latest persisted project model for a repository can be inspected with:

```text
GET /api/repositories/:repositoryId/index
```

It returns the base SHA, indexed file count, generated timestamp and structured model.

## Database

Prisma schema and an initial PostgreSQL migration are included. For development:

```bash
pnpm db:migrate
```

For an already prepared production database/migration workflow:

```bash
pnpm --filter @mergeguard/db prisma:deploy
```

## Offline tests

```bash
pnpm test:offline
```

The included offline tests do not require Jev, GitHub, GitLab, PostgreSQL or Redis credentials. They exercise detector fixtures, mocked Jev structured verification, repository-intelligence discovery/graph behavior, source syntax/transpilation, and a scan for forbidden generative-AI provider endpoints.

See `TEST_REPORT.md` for the exact scope.

## Important accuracy boundary

MergeGuard is a review assistant, not a proof system. Repository-aware indexing materially reduces isolated-file false positives, but it does not yet provide complete interprocedural taint analysis or mathematically prove the absence of bugs. A clean report must never be treated as proof that a PR is safe.

For very large repositories, `INDEX_MAX_FILES` intentionally caps the indexed source set. High-signal config files and files near changed package roots are prioritized first.

## Repository layout

```text
apps/
  api/          webhook/API service
  worker/       GitHub/GitLab adapters, repository indexing, review pipeline
  web/          dashboard
packages/
  analyzer/     deterministic + TypeScript AST detectors
  core/         finding/risk domain model
  repo-intel/   Project Brain: stack, graph, routes, DB, Redis, Docker/Nginx
  providers/    Jev-only semantic verification
  db/           Prisma/PostgreSQL persistence
  policy/       .mergeguard.yml review configuration parser
tests/
  detectors.mjs
  repo-intel.mjs
  jev-mock.mjs
  syntax-check.cjs
```

See `SECURITY.md` for deployment and trust-boundary guidance.


## One-command lifecycle

Use `start.sh` instead of typing raw Docker Compose commands:

```bash
./start.sh dev up
./start.sh dev stop
./start.sh dev down
./start.sh prod up
./start.sh prod stop
./start.sh prod down
./start.sh prod status
./start.sh prod health
./start.sh prod logs worker
./start.sh test
```

Run `./start.sh help` for the complete command list.
