# Troubleshooting

## GitHub webhook is delivered but no review appears

Check, in order:

1. API logs for signature validation failures.
2. Redis connectivity and BullMQ enqueue errors.
3. Worker logs for the job/head SHA.
4. GitHub App repository installation and permissions.
5. GitHub API rate-limit/401/403 responses.
6. Jev failures if `REQUIRE_JEV=true`.
7. Database errors while creating the analysis run.

## GitLab MR note is missing

Check:

- webhook secret;
- project/group webhook is enabled for merge-request events;
- `GITLAB_TOKEN` can read project/MR data and write notes;
- `GITLAB_BASE_URL` is correct for self-managed GitLab;
- worker outbound network access.

## `/health/live` works but `/health/ready` fails

The process is running, but PostgreSQL or Redis is unavailable. Check `DATABASE_URL`, `REDIS_URL`, DNS/container network and service health.

## Reviews are slow

Determine where time is spent:

- first index of a base SHA;
- GitHub/GitLab source fetching;
- AST/static analysis CPU time;
- Jev request latency;
- queue wait time.

For large monorepos, tune conservatively:

```env
INDEX_MAX_FILES=260
INDEX_FETCH_CONCURRENCY=10
MAX_RELATED_FILES=30
WORKER_CONCURRENCY=3
JEV_CONCURRENCY=6
```

Do not simply increase every concurrency value; that can create API throttling or memory pressure.

## Too many false positives

- confirm repository indexing detected the right framework/DB/conventions;
- inspect whether relevant guards/constraints/files are in the indexed file set;
- add repository ignore/policy configuration;
- lower noisy detector priority rather than globally disabling high-signal categories;
- keep confidence thresholds conservative.

## Missing a cross-file issue

The relevant file may not be in the current bounded index/subgraph. Inspect the repository index endpoint and increase limits only when justified. The long-term roadmap includes deeper symbol/call/data-flow indexing.

## Duplicate analyses

Analysis jobs are keyed to repository/change/head SHA and the DB enforces head-level uniqueness. If duplicates appear, inspect provider IDs, normalized repository identity and whether multiple independent MergeGuard deployments are processing the same webhook.

## Jev unavailable

With:

```env
REQUIRE_JEV=true
JEV_FAIL_OPEN=false
```

semantic review should fail instead of pretending verification occurred. For local/offline testing you can omit the Jev key and use deterministic behavior.

## `start.sh` problems

### `./start.sh prod up` says CHANGE_ME values remain

This is intentional. Edit `.env.production` and replace every placeholder. Production will not start with known example secrets.

### `./start.sh dev up` cannot find pnpm

Development mode runs the TypeScript processes on the host and therefore needs Node.js 22+ plus pnpm/Corepack. Production mode runs the app in Docker and does not require host Node.js.

### I want a clean restart without deleting data

Use:

```bash
./start.sh prod down
./start.sh prod up
```

`down` intentionally does not pass `--volumes`; PostgreSQL/Redis persistent volumes survive. Back up PostgreSQL before destructive maintenance anyway.
