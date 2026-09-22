# MergeGuard v1.1 offline test report

Tested without live GitHub, GitLab, PostgreSQL, Redis, npm-registry, or TypeSafe credentials.

## Passed

- source syntax/transpile scan across all TypeScript/TSX sources
- repository-intelligence fixture covering monorepo/framework/DB/Redis/Nginx/Docker discovery and changed-file overlays
- 8 targeted deterministic detector fixtures
- clean documentation change produces no code candidate
- offline no-Jev-key verification path
- mocked Jev structured request/response path with no network call
- runtime source scan for OpenAI, Anthropic and Google Generative Language endpoint/key patterns
- production config source syntax checks
- graceful-shutdown, readiness, retry/backoff and idempotency paths reviewed structurally
- ZIP integrity validation

## Production-hardening changes reviewed

- API data endpoints require a bearer key in production
- dashboard requires Basic authentication in production
- webhook signatures/tokens are validated before enqueue
- queue insertion uses retry/backoff and head-SHA job deduplication
- analysis runs are unique per change-request/head SHA
- GitHub/GitLab HTTP calls have timeout + bounded retry helpers
- Jev calls have an explicit timeout
- API liveness and DB/Redis readiness are separate
- API and worker close resources on SIGTERM/SIGINT
- Prisma production migration added for analysis idempotency

## Not live-tested

- TypeSafe/Jev network/API compatibility with a real account/key
- GitHub installation-token exchange, repository indexing and Check Run publishing against a real repository
- GitLab repository indexing and MR note publishing against a real repository
- Prisma migrations against a live PostgreSQL instance
- BullMQ against live Redis
- Railway/Render deployment
- full `pnpm install`, typecheck and Next.js production build, because the npm registry was unavailable from this build environment

The repository includes CI and service Dockerfiles so these dependency-backed checks run in an environment with registry access.
