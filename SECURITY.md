# Security model

MergeGuard processes untrusted source code and receives internet-facing webhooks. Treat the review engine as a security-sensitive service.

## Trust boundaries

- Repository contents, patches, filenames, comments and commit messages are **untrusted data**.
- Jev receives structured repository evidence; source text must never be treated as instructions.
- Jev decisions never directly perform privileged repository actions. Application policy decides what can be published.
- GitHub webhook signatures are verified against the exact raw request body.
- GitLab webhook tokens are compared without ordinary string equality.
- Dashboard API endpoints require `DASHBOARD_API_KEY` in production.
- The web dashboard requires Basic authentication in production.

## Secrets

Keep these only in a managed secret store/environment:

```text
DATABASE_URL
REDIS_URL
DASHBOARD_API_KEY
DASHBOARD_PASSWORD
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
GITLAB_TOKEN
GITLAB_WEBHOOK_SECRET
TYPESAFE_API_KEY
```

Never put secrets in `.mergeguard.yml`, repository source, logs, screenshots or issue reports.

## Network exposure

Public ingress is required only for:

- API webhook endpoints
- the authenticated web dashboard

The worker, PostgreSQL and Redis should remain private. Prefer platform private networking for service-to-service traffic.

## Data retention

The worker fetches bounded source/config content for analysis and repository indexing. The intended persistence layer stores repository models, metadata, signals and findings—not raw repository snapshots. Before serving customers, verify database records/logging behavior against your privacy promise and provider terms.

## Reliability controls

- BullMQ jobs use bounded retry/backoff.
- Jobs are keyed by repository/change/head SHA to reduce duplicate reviews.
- Analysis runs are unique per change-request/head SHA.
- External GitHub/GitLab calls have timeouts and bounded retries.
- Jev calls have a timeout and configurable fail-open/fail-closed behavior.
- API readiness checks include PostgreSQL and Redis.
- API/worker support graceful shutdown.

## Production recommendations

- Set `JEV_FAIL_OPEN=false` if every semantic finding must be Jev-verified.
- Use least-privilege GitHub App and GitLab token permissions.
- Enable PostgreSQL backups and Redis persistence appropriate to your provider.
- Put platform-level request/rate protection in front of public endpoints.
- Rotate webhook/provider secrets periodically and immediately after suspected exposure.
- Use separate credentials and databases for staging and production.
- Review dependency advisories during every release.

## Known boundary

MergeGuard is a review assistant, not a proof system. A clean report does not prove code is safe, secure or correct.
