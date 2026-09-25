# Integrations

All surfaces call the same `review()` engine.

## Local

`mergeguard review` compares the working tree (including untracked files) with `HEAD`. `--staged` limits the review to the index.

## Pre-push

`mergeguard hook install` adds a managed block to the pre-push hook (including `core.hooksPath`). Git supplies local/remote refs on stdin; MergeGuard reviews the outgoing range. Existing hook content is retained.

## GitHub

See [`examples/github/mergeguard.yml`](../examples/github/mergeguard.yml). Use `fetch-depth: 0` so merge-base works. `--format sarif` is available for code scanning upload.

## GitLab

See [`examples/gitlab/mergeguard.yml`](../examples/gitlab/mergeguard.yml). `--format gitlab` writes Code Quality JSON. Use `artifacts: when: always` so findings upload even when the gate exits `1`.

## Jenkins / CircleCI / Azure DevOps / Bitbucket / Buildkite / custom

```bash
npx mergeguard review --base origin/main --head HEAD
```

The contract is the exit code plus optional JSON/SARIF/GitLab output. No provider API credentials are required for offline or Laya verification.
