# Quick start

This guide gets MergeGuard running with the fewest decisions. Use it first, then follow either [GitLab setup](GITLAB_SETUP.md) or [GitHub setup](GITHUB_SETUP.md).

## Prerequisites

Development mode needs:

- Linux/macOS/WSL or another Bash-compatible environment;
- Docker Engine/Desktop with Docker Compose v2;
- Node.js 22+ and Corepack/pnpm;
- Git.

Production mode only requires Docker Engine/Compose on the server because the application itself runs in containers.

## Development

```bash
cp .env.example .env
./start.sh dev up
```

The first run starts PostgreSQL and Redis, installs workspace dependencies, generates Prisma, applies migrations, then starts the API, worker and dashboard.

Useful commands:

```bash
./start.sh dev status
./start.sh dev health
./start.sh dev logs
./start.sh dev stop
./start.sh dev down
./start.sh test
./start.sh check
```

Development defaults:

- dashboard: `http://localhost:3000`
- API: `http://localhost:4000`
- API liveness: `http://localhost:4000/health/live`
- API readiness: `http://localhost:4000/health/ready`

Jev is optional in development. Keep `REQUIRE_JEV=false` to exercise deterministic analysis without an API key.

## Production on your own server

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and replace every `CHANGE_ME` value. Then:

```bash
./start.sh prod up
./start.sh prod health
./start.sh prod status
```

`prod up` builds the images, starts PostgreSQL/Redis, applies migrations, then starts the API, worker and dashboard.

The production Compose file binds the API/dashboard to `127.0.0.1` by default. Put Nginx/Caddy/another reverse proxy in front for HTTPS; see [Self-hosting](SELF_HOSTING.md).

## Connect a repository

- GitLab: follow [GITLAB_SETUP.md](GITLAB_SETUP.md).
- GitHub: follow [GITHUB_SETUP.md](GITHUB_SETUP.md).
- Then run the deterministic end-to-end smoke test in [FIRST_LIVE_TEST.md](FIRST_LIVE_TEST.md).

## What success looks like

A PR/MR event reaches `/webhooks/...`, the API queues one job for the repository + change number + head SHA, the worker loads/builds repository intelligence, runs detectors, optionally verifies ambiguous candidates with Jev, stores the result, and publishes a GitHub Check or GitLab MR note.
