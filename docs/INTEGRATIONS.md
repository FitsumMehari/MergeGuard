# Integrations

All surfaces call the same `review()` engine.

Install once:

```bash
npm install -D @fitsummehari/mergeguard
```

Do not install the unscoped name `mergeguard` (different package). Do not use bare `npx mergeguard` until the scoped package is installed locally; for a one-off:

```bash
npx --package=@fitsummehari/mergeguard mergeguard review
```

## Local

`mergeguard review` compares the working tree (including untracked files) with `HEAD`. `--staged` limits the review to the index. Default verifier is `offline`.

## Pre-push

`mergeguard hook install` adds a managed block to the pre-push hook (including `core.hooksPath`). Git supplies local/remote refs on stdin; MergeGuard reviews the outgoing range. Existing hook content is retained.

## GitHub

See [`examples/github/mergeguard.yml`](../examples/github/mergeguard.yml). Use `fetch-depth: 0` so merge-base works. Default templates pin `--verifier offline`. Optional Laya CI is in [LAYA.md](LAYA.md).

## GitLab

See [`examples/gitlab/mergeguard.yml`](../examples/gitlab/mergeguard.yml). `--format gitlab` writes Code Quality JSON. Use `artifacts: when: always` so findings upload even when the gate exits `1`.

## Jenkins / CircleCI / Azure DevOps / Bitbucket / Buildkite / custom

```bash
npm install -D @fitsummehari/mergeguard
npx mergeguard review --verifier offline --base origin/main --head HEAD
```

The contract is the exit code plus optional JSON/SARIF/GitLab output. No provider API credentials are required for offline verification.
