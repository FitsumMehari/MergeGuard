# Self-hosting

This is the recommended way to run MergeGuard on a company server. The supported operator interface is `start.sh`; raw Docker Compose commands are implementation details and are not required for normal operation.

## Fast path

```bash
cp .env.production.example .env.production
# edit .env.production and replace every CHANGE_ME value
./start.sh prod up
./start.sh prod health
./start.sh prod status
```

Lifecycle commands:

```bash
./start.sh prod up
./start.sh prod stop       # preserve containers/data, stop services
./start.sh prod down       # remove containers/network, preserve volumes
./start.sh prod restart
./start.sh prod status
./start.sh prod logs
./start.sh prod logs worker
./start.sh prod health
./start.sh prod migrate
```

The rest of this guide explains networking, reverse proxying, backups and operational details.

This is the recommended guide when you already have a Linux server and want to run MergeGuard yourself.

## What runs

MergeGuard has five runtime components:

```text
Nginx / HTTPS
   ├─ Web dashboard
   └─ API / webhooks

API → Redis queue → Worker
                ↘
                 PostgreSQL

Worker → GitHub/GitLab APIs + Jev API
```

The worker does the expensive analysis. The API should stay lightweight and return from webhook requests after validation/enqueueing.

## Recommended server baseline

For an early team deployment:

- Ubuntu/Debian Linux;
- Docker Engine + Docker Compose v2;
- 4+ CPU cores recommended;
- 8 GB RAM recommended for comfortable monorepo analysis;
- persistent disk for PostgreSQL;
- public HTTPS access for the API webhook endpoint;
- outbound HTTPS access to GitHub/GitLab and TypeSafe/Jev.

Larger monorepos may benefit from more RAM because repository indexing and AST analysis are CPU/memory work even though they do not incur AI cost.

## Install

```bash
unzip mergeguard-production-v1.1.zip
cd mergeguard-production
cp .env.example .env
```

Fill the required secrets in `.env`.

## Data services

The repository includes a development Compose file. For production, run PostgreSQL and Redis with persistent/restart settings. The important application connection values are:

```env
DATABASE_URL=postgresql://mergeguard:strong-password@postgres:5432/mergeguard
REDIS_URL=redis://redis:6379
```

Keep Redis and PostgreSQL private. They do not need public ports.

## Build services

MergeGuard includes:

```text
Dockerfile.api
Dockerfile.worker
Dockerfile.web
```

A production Compose definition should build one container from each file and run PostgreSQL/Redis alongside them.

Typical lifecycle:

```bash
docker compose build
docker compose run --rm api pnpm db:deploy
docker compose up -d
```

Check status:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web
```

## Nginx

Expose only the dashboard and API.

Example topology:

```text
mergeguard.example.com      → 127.0.0.1:3000
api.mergeguard.example.com  → 127.0.0.1:4000
```

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name mergeguard.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.mergeguard.example.com;

    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add TLS using your normal certificate mechanism (for example Certbot/Let's Encrypt in an internet-facing deployment).

## Health checks

```text
GET /health/live
GET /health/ready
```

`/health/live` means the API process is running. `/health/ready` checks PostgreSQL and Redis and should be used by production monitoring/restart orchestration.

## Webhook URLs

GitHub:

```text
https://api.mergeguard.example.com/webhooks/github
```

GitLab:

```text
https://api.mergeguard.example.com/webhooks/gitlab
```

## Updating

Use an explicit deploy procedure:

```bash
git pull
docker compose build
docker compose run --rm api pnpm db:deploy
docker compose up -d
```

Do not run `prisma migrate dev` on production.

## Backups

Back up PostgreSQL regularly. Repository source files are not intended to be persisted by MergeGuard, but findings, analysis history and repository models are.

Example database dump:

```bash
docker compose exec -T postgres pg_dump -U mergeguard mergeguard > mergeguard-$(date +%F).sql
```

Test restore procedures before depending on those backups.

## Scaling

Start with one API, one web service and one worker. Increase worker capacity first if the queue grows.

Important controls:

```env
WORKER_CONCURRENCY=3
JEV_CONCURRENCY=6
INDEX_FETCH_CONCURRENCY=10
```

Increase gradually while observing CPU, memory, GitHub/GitLab rate limits and Jev error/latency behavior.