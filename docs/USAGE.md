# How to use MergeGuard

## GitHub workflow

1. Install/configure the GitHub App for the repository.
2. Open or update a Pull Request.
3. GitHub sends a signed webhook to MergeGuard.
4. The API queues the head SHA for analysis.
5. The worker loads or builds the repository model, runs review and Jev verification.
6. MergeGuard publishes a GitHub Check for the analyzed head.
7. Open the dashboard when deeper history/context is needed.

MergeGuard handles the normal PR events used for review: `opened`, `reopened`, `synchronize`, and `ready_for_review`.

## GitLab workflow

1. Configure a project/group merge-request webhook.
2. Open or update a Merge Request.
3. GitLab sends the webhook to MergeGuard.
4. The worker performs the same normalized analysis pipeline used for GitHub.
5. MergeGuard posts an MR note/report.

## Interpreting results

A useful review should prioritize findings such as:

```text
HIGH — Possible duplicate payment
Confidence: 94%

A read/check/write sequence appears reachable concurrently and no
transaction, lock, atomic update or uniqueness protection was found
in the relevant repository context.
```

Treat findings as evidence-backed review leads. A high-confidence finding should be inspected and either fixed, explained, or suppressed by repository policy when intentional.

## Risk levels

- `LOW` — no high-impact finding was confirmed; mostly low-risk changes.
- `MEDIUM` — one or more issues deserve normal reviewer attention.
- `HIGH` — important correctness/security/data/performance concerns deserve focused review before merge.
- `CRITICAL` — a high-impact, high-confidence issue warrants stopping the merge until understood.

Risk is intentionally separate from code quality. A large auth migration can be high-risk even when it contains no confirmed bug.

## Repository indexing behavior

The first review against an unseen base SHA can take longer because MergeGuard builds a bounded project model. Later pushes to the same PR/MR base reuse that model.

Conceptually:

```text
base SHA A → build repository model once
   ├─ head 1 → overlay changed files + review
   ├─ head 2 → overlay changed files + review
   └─ head 3 → overlay changed files + review
```

This prevents a full monorepo rediscovery on every commit.

## Local/offline development

When `TYPESAFE_API_KEY` is absent and production does not require Jev, deterministic detectors can still run. This is useful for development and unit tests. Production deployments should normally set:

```env
REQUIRE_JEV=true
JEV_FAIL_OPEN=false
```

so a failed Jev verification is not silently treated as a completed semantic review.
