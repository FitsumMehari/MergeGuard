# Development guide

## Local requirements

- Node.js 22+
- pnpm 10+
- PostgreSQL
- Redis

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm build
pnpm test:offline
```

Run services separately:

```bash
pnpm --filter @mergeguard/api dev
pnpm --filter @mergeguard/worker dev
pnpm --filter @mergeguard/web dev
```

## Package boundaries

Keep provider/platform and analysis concerns separate. A detector should not know how GitHub Checks are published. A GitHub adapter should not implement security-analysis heuristics.

Conceptually:

```text
platform adapters → normalized change model
repository intelligence → structured repo facts
analyzers/detectors → candidates
Jev package → semantic verification
core/risk → final analysis
publishers → GitHub/GitLab output
```

## Adding a detector

A good detector should:

1. identify a concrete structural signal;
2. attach file/line/evidence;
3. avoid claiming more than static evidence proves;
4. state what context could suppress the candidate;
5. use Jev only if ambiguity is genuinely semantic;
6. include a fixture/test for positive and safe variants.

Avoid broad regex rules that produce style noise without actionable impact.

## Adding a repository adapter

Framework/technology adapters should extract facts into the project model rather than put framework assumptions in every detector.

For example, a NestJS adapter discovers guards/routes; an authorization detector consumes those normalized facts.

## Tests

Offline tests include:

- syntax/transpile validation;
- detector fixtures;
- repository-intelligence fixtures;
- mocked Jev request/response verification.

Run:

```bash
pnpm test:offline
```

Live integration testing requires real GitHub/GitLab/Jev credentials and should use dedicated test repositories/projects rather than production repos.

## Engineering practices

- validate external input at boundaries;
- keep functions/modules focused;
- prefer typed domain objects over loose provider payloads;
- use bounded concurrency for network/analysis work;
- make retries idempotent;
- avoid logging secrets/source unnecessarily;
- fail loudly on missing production security configuration;
- commit migrations and use deploy migrations in production;
- add tests for each bug fixed in queue/webhook/idempotency logic.
