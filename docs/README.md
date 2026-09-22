# MergeGuard documentation

This folder is the complete product and operator guide for MergeGuard.

MergeGuard is a repository-aware GitHub PR / GitLab MR review system. It builds a reusable model of the repository, runs deterministic/static detectors, asks Jev structured questions for ambiguous findings, filters low-confidence noise, and publishes a concise review back to the code-hosting platform.

## Start here

- [Quick start](QUICK_START.md) — shortest path from clone/ZIP to a running stack.
- [GitLab setup](GITLAB_SETUP.md) — token, webhook and first project integration.
- [GitHub setup](GITHUB_SETUP.md) — GitHub App permissions, webhook and installation.
- [First live test](FIRST_LIVE_TEST.md) — prove the full webhook → worker → Jev → PR/MR result path.
- [Features](FEATURES.md) — what MergeGuard currently reviews and how findings are classified.
- [How to use](USAGE.md) — daily developer workflow for GitHub and GitLab.
- [Self-hosting](SELF_HOSTING.md) — run the whole stack on your own Linux server with Docker Compose and Nginx.
- [Configuration](CONFIGURATION.md) — environment variables and `.mergeguard.yml`.
- [Architecture](ARCHITECTURE.md) — services, queues, Project Brain, review pipeline, caching and Jev integration.
- [Examples](EXAMPLES.md) — realistic issue examples and expected reports.
- [Repository intelligence](REPOSITORY_INTELLIGENCE.md) — how MergeGuard learns monorepos, NestJS, Next.js, databases, Redis, Docker and Nginx.
- [Security and privacy](SECURITY_AND_PRIVACY.md) — trust boundaries, source handling, secrets and production guidance.
- [Troubleshooting](TROUBLESHOOTING.md) — common deployment and analysis issues.
- [Development](DEVELOPMENT.md) — local setup, tests, adding detectors/adapters and engineering conventions.
- [Limitations and roadmap](LIMITATIONS.md) — what the current engine does not guarantee yet.
- [Deployment platforms](DEPLOYMENT.md) — managed-platform deployment reference.
- [Product direction](PRODUCT.md) — product philosophy and longer-term roadmap.

## High-level flow

```text
GitHub PR / GitLab MR
        ↓
Webhook API
        ↓
BullMQ / Redis
        ↓
Worker
        ├─ load or build Repository Intelligence index
        ├─ overlay changed files
        ├─ run deterministic/AST detectors
        ├─ enrich candidates with repository evidence
        ├─ ask Jev structured verification questions
        └─ aggregate findings + risk
        ↓
PostgreSQL
        ↓
GitHub Check / GitLab MR note + dashboard
```

## Current target stack

The repository-intelligence layer is strongest for TypeScript/JavaScript projects, especially:

- pnpm/npm/yarn workspaces, Nx and Turborepo-style monorepos;
- NestJS;
- Next.js;
- Prisma plus generic SQL/ORM signals;
- PostgreSQL and MariaDB/MySQL;
- Redis/ioredis/BullMQ;
- Docker and Docker Compose;
- Nginx.

The core remains extensible: framework-specific understanding is implemented as adapters and repository facts rather than hard-coded assumptions in the review engine.
