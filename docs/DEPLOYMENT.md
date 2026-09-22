# Production deployment

MergeGuard is intentionally deployed as three application services plus two data services:

```text
Internet
  ├─ GitHub/GitLab ──> API (public) ──> Redis queue
  └─ Browser ────────> Web (public) ──> API (private when supported)
                                     
Redis queue ──> Worker (private/no inbound traffic)
                    ├─ GitHub/GitLab APIs
                    ├─ TypeSafe Jev API
                    └─ PostgreSQL

API + Worker + Web ──> PostgreSQL / Redis
```

The API must be public because GitHub/GitLab deliver webhooks to it. The web dashboard is public at the network layer but protected with HTTP Basic authentication. The worker, PostgreSQL and Redis do not need public ingress.

## Recommended first deployment: Railway

Create one Railway project with these services:

1. `postgres` — Railway managed PostgreSQL
2. `redis` — Railway managed Redis
3. `api` — this repository using `Dockerfile.api`
4. `worker` — this repository using `Dockerfile.worker`
5. `web` — this repository using `Dockerfile.web`

Use one production environment and optionally a separate staging environment. Keep database/Redis private.

### API service

Set the Dockerfile path to:

```text
Dockerfile.api
```

Give the API a public Railway domain or custom domain. Configure the health-check path:

```text
/health/ready
```

Recommended variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
WEB_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}

DASHBOARD_API_KEY=<64+ random hex chars>

GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY=...
GITHUB_WEBHOOK_SECRET=...
GITLAB_WEBHOOK_SECRET=...
```

If the service is named differently, use Railway's reference-variable picker rather than copying values manually.

Run database migrations as a Railway pre-deploy command on exactly one application service (normally API):

```bash
pnpm db:deploy
```

Do not run concurrent migrations from API and worker replicas.

### Worker service

Use:

```text
Dockerfile.worker
```

Do **not** generate a public domain. Variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
WEB_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}

GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY=...
GITLAB_BASE_URL=https://gitlab.com
GITLAB_TOKEN=...

TYPESAFE_API_KEY=...
JEV_API_URL=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest
JEV_FAIL_OPEN=false
REQUIRE_JEV=true
REQUIRE_JEV=true

WORKER_CONCURRENCY=3
JEV_CONCURRENCY=6
HTTP_TIMEOUT_MS=20000
HTTP_MAX_ATTEMPTS=3
```

`JEV_FAIL_OPEN=false` is recommended when Jev verification is mandatory in production. Set it to `true` only if you intentionally want deterministic findings to continue when Jev is unavailable.

Scale the worker before scaling the API. For most early teams, one API replica and one worker replica are enough.

### Web service

Use:

```text
Dockerfile.web
```

Give it a public domain. Variables:

```env
NODE_ENV=production
API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
DASHBOARD_API_KEY=<same value as API>
DASHBOARD_USER=<admin username>
DASHBOARD_PASSWORD=<strong unique password>
```

Railway private networking is preferred for `web -> api`, PostgreSQL and Redis communication. Only the API webhook endpoints and the web dashboard need public ingress.

### GitHub App

Set the webhook URL to:

```text
https://<api-public-domain>/webhooks/github
```

Subscribe to Pull Request events. Typical permissions:

- Metadata: read
- Contents: read
- Pull requests: read
- Checks: write

The webhook secret in GitHub must exactly match `GITHUB_WEBHOOK_SECRET`.

### GitLab

Create a project/group webhook pointing to:

```text
https://<api-public-domain>/webhooks/gitlab
```

Enable merge-request events and set the webhook secret token to `GITLAB_WEBHOOK_SECRET`. Give `GITLAB_TOKEN` only the API permissions needed to read repository/MR data and write MR notes.

## Secrets

Generate application secrets locally, for example:

```bash
openssl rand -hex 32
```

Use separate values for:

- `DASHBOARD_API_KEY`
- `DASHBOARD_PASSWORD`
- `GITHUB_WEBHOOK_SECRET`
- `GITLAB_WEBHOOK_SECRET`

Do not commit `.env` files or private keys. Use Railway sealed/shared variables where appropriate.

## Health and deploy behavior

The API exposes:

```text
GET /health/live   # process is running
GET /health/ready  # PostgreSQL and Redis are reachable
```

Use `/health/ready` for deployment health checks. A process can be alive while not ready to accept production webhook traffic.

API and worker handle `SIGTERM`/`SIGINT` and close HTTP/queue/Redis/Prisma connections before exit.

## Database migrations

Development:

```bash
pnpm db:migrate
```

Production:

```bash
pnpm db:deploy
```

The production command applies committed Prisma migrations only. Never use `prisma migrate dev` against production.

## Scaling

Start with:

```text
api:       1 replica
worker:    1 replica, WORKER_CONCURRENCY=3
web:       1 replica
postgres:  managed
redis:     managed
```

Then watch queue age. If analyses wait in Redis while CPU/memory remain healthy, increase worker replicas or `WORKER_CONCURRENCY` gradually. Keep `JEV_CONCURRENCY` bounded so worker scaling does not create uncontrolled provider concurrency.

Repository indexes are cached by base SHA in PostgreSQL and PR/MR jobs are deduplicated by repository/change/head SHA, so repeated webhook deliveries and pushes to the same head do not intentionally multiply work.

## Monitoring

At minimum alert on:

- `/health/ready` failures
- worker crashes/restarts
- BullMQ queue age and failed-job count
- PostgreSQL connection exhaustion
- Redis memory/availability
- GitHub/GitLab 401/403/429/5xx responses
- Jev timeout/error rate
- average analysis duration
- findings per review and false-positive feedback

Do not log webhook secrets, provider tokens, source file contents or private keys.

## Backups and retention

Enable managed PostgreSQL backups before onboarding external customers. Repository source content is not intended to be persisted in the current design; repository models, findings, signals and metadata are persisted. Decide and document retention before production use.

## Alternative: Render

Render also maps well to the architecture: web/API as web services, worker as a Background Worker, Postgres as Render Postgres, and Redis-compatible queue storage as Render Key Value. Use the same three Dockerfiles and environment-variable separation.
