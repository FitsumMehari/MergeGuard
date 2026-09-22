# Configuration

MergeGuard uses environment variables for secrets/runtime infrastructure and `.mergeguard.yml` for repository-level review policy.

## Core infrastructure

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
WEB_URL=https://mergeguard.example.com
```

## Jev

```env
TYPESAFE_API_KEY=...
JEV_API_URL=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest
JEV_CONCURRENCY=6
REQUIRE_JEV=true
JEV_FAIL_OPEN=false
```

`REQUIRE_JEV=true` means production analysis must have a Jev key. `JEV_FAIL_OPEN=false` means a Jev outage does not silently mark semantic verification as successful.

## Repository indexing

```env
INDEX_MAX_FILES=800
INDEX_MAX_FILE_BYTES=120000
INDEX_MAX_FILE_CHARS=120000
INDEX_FETCH_CONCURRENCY=12
INDEX_MAX_TREE_PAGES=80
MAX_RELATED_FILES=50
```

Defaults are sized for NestJS/TypeORM/Lerna monorepos (QuizLand-style). Lower them only on small repositories if first-index time or memory is a problem.

## Worker/runtime

```env
WORKER_CONCURRENCY=3
HTTP_TIMEOUT_MS=20000
HTTP_MAX_ATTEMPTS=3
```

Keep worker concurrency bounded. One large monorepo analysis can consume meaningful CPU/RAM even when Jev calls are inexpensive.

## GitHub

```env
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=...
```

Typical app permissions:

- Metadata: read
- Contents: read
- Pull requests: read
- Checks: write

## GitLab

```env
GITLAB_BASE_URL=https://gitlab.com
GITLAB_TOKEN=...
GITLAB_WEBHOOK_SECRET=...
```

Use the least privilege token capable of reading project/MR content and writing the desired MR report.

## Dashboard

```env
DASHBOARD_API_KEY=<long-random-secret>
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=<strong-password>
```

This authentication is appropriate for an internal/single-admin deployment. It is not a complete multi-tenant SaaS identity model.

## `.mergeguard.yml`

A repository can include `.mergeguard.yml` for review policy. The example in `examples/.mergeguard.yml` is the starting point.

Typical concerns to configure include:

```yaml
version: 1

review:
  bugs: true
  security: true
  performance: true
  scalability: true
  maintainability: true

confidence:
  inline_comment: 0.85
  warning: 0.80
  blocker: 0.92

ignore:
  paths:
    - "docs/**"
    - "generated/**"
    - "dist/**"

context:
  max_dependency_depth: 3
```

Repository-declared policy should be explicit and version-controlled. Avoid encoding organization-specific secrets in this file.
