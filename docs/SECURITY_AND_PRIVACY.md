# Security and privacy

## Principles

- Treat repository content as untrusted input.
- Request the minimum GitHub/GitLab permissions required.
- Never log secrets/private keys/source content unnecessarily.
- Keep PostgreSQL/Redis private.
- Validate webhook authenticity before queueing work.
- Do not allow model output to directly perform privileged repository actions.

## Source handling

MergeGuard fetches repository content needed for indexing/review. The intended design persists structured repository models, findings, signals and metadata rather than storing full repository source indefinitely.

Before onboarding external customers, define and document exact retention behavior for:

- source snippets inside findings;
- repository model snapshots;
- analysis history;
- logs;
- backups.

## GitHub webhook security

GitHub HMAC verification must use the exact raw request body. Do not parse and re-serialize JSON before signature verification.

## GitLab webhook security

Validate the configured webhook secret token and use a least-privilege API token.

## Jev boundary

Jev receives structured state/context required for verification. Source code, comments and filenames are data, not instructions. The application validates structured responses before changing finding status/risk.

## Dashboard authentication

The current Basic-auth + internal API-key setup is meant for internal/early private deployment. A public multi-tenant SaaS requires proper user/organization/session/RBAC authorization and tenant filtering in every data query.

## Infrastructure

Recommended:

- HTTPS only for public endpoints;
- firewall public ingress to Nginx/80/443 only;
- no public PostgreSQL/Redis ports;
- regular OS/container updates;
- secret rotation;
- PostgreSQL backups;
- monitoring for repeated auth failures and webhook signature failures.

See the root `SECURITY.md` for disclosure and implementation-specific notes.
