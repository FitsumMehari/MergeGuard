# Integrations

## Local manual review

`mergeguard review` compares the working tree (including untracked files) with `HEAD`. `--staged` limits the review to the index.

## Pre-push

`mergeguard hook install` adds a managed block to `.git/hooks/pre-push`. Git supplies local/remote refs on stdin; MergeGuard reviews the exact outgoing range when possible. Existing pre-push hook content is retained.

## GitHub

Run on `pull_request` with full checkout history and pass the base branch plus PR head SHA. The CLI exit code can be made a required status check. `--format sarif` is available for workflows that upload SARIF to GitHub code scanning.

## GitLab

Run on merge-request pipelines with the target branch and `CI_COMMIT_SHA`. `--format gitlab` writes GitLab Code Quality JSON. Use `artifacts: when: always` so findings are uploaded even when the gate returns exit code 1.

## Jenkins / CircleCI / Azure DevOps / Bitbucket

Any runner with Git and Node 20+ can execute:

```bash
mergeguard review --base origin/main --head HEAD
```

The integration contract is the exit code plus optional JSON/SARIF output; no provider API credentials are required for local/offline/Laya verification.
