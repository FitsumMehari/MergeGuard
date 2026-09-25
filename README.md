# MergeGuard

**Local-first semantic code review for Git diffs.** MergeGuard runs before a push or in CI, looks for concrete runtime/security/data-integrity regressions, resolves nearby repository context, and returns a normal process exit code. It does not require a MergeGuard server, database, queue, dashboard, GitHub App, or GitLab webhook.

```text
Git diff
  ↓
MergeGuard
  ├─ high-signal diff detectors
  ├─ repository/context resolver
  ├─ deterministic verifier (always available)
  └─ optional local Laya verifier
  ↓
terminal / JSON / SARIF / GitLab Code Quality
  ↓
PASS (0) / BLOCK (1)
```

## What it catches

MergeGuard is intentionally not a formatting linter. It targets changes with a plausible failure mode, including:

- concurrency races such as check-then-create and read-check-write;
- transaction removal and multi-write partial-success risks;
- tenant/organization/ownership predicates removed from data access;
- authorization guards/policies removed or anonymous access introduced;
- unsafe SQL construction, shell execution, raw HTML sinks and path traversal candidates;
- disabled TLS verification and unsafe native deserialization;
- webhook side effects without visible idempotency protection;
- destructive or risky database migrations;
- broad deletes/updates;
- async `forEach`, swallowed exceptions, unsafe retry loops;
- N+1 query candidates and unbounded async fan-out;
- repository-aware checks for common Node, Python, Java/Kotlin, Go, PHP, Ruby, .NET and Rust stacks.

It deliberately avoids style noise such as semicolons, naming preferences, import ordering, line length, generic "refactor this" comments, and documentation nags.

## Requirements

- Git
- Node.js 20+

There are **zero npm runtime dependencies**. Laya is optional and runs as a local Python process when installed; no model server is required.

## Install

When published as a CLI:

```bash
npm install --global mergeguard
```

For a Node repository you can pin it instead:

```bash
npm install --save-dev mergeguard
npx mergeguard review
```

From this source checkout:

```bash
node bin/mergeguard.js review
```

## Local usage

Review the complete working tree (staged + unstaged + untracked) against `HEAD`:

```bash
mergeguard review
```

Review staged changes only:

```bash
mergeguard review --staged
```

Review a branch/PR range:

```bash
mergeguard review --base main
mergeguard review --base origin/main --head HEAD
```

Force deterministic local verification:

```bash
mergeguard review --no-ai
```

Machine-readable reports:

```bash
mergeguard review --format json
mergeguard review --format sarif --output mergeguard.sarif
mergeguard review --format gitlab --output gl-code-quality-report.json
```

Exit codes are stable: `0` means review completed without a blocking finding, `1` means review completed and found a blocking issue, and `2` means MergeGuard/config/runtime itself failed.

## Pre-push hook

```bash
mergeguard hook install
```

The installer adds a clearly marked MergeGuard block to `.git/hooks/pre-push`. Existing hook content is preserved. On each normal `git push`, MergeGuard reads Git's pre-push refs from stdin and reviews only the outgoing commit range.

```text
git push
   ↓
pre-push hook
   ↓
mergeguard review --push
   ↓
PASS → push continues
BLOCK → push stops
```

Local Git hooks can always be bypassed with `git push --no-verify`; use CI as the enforcement layer.

Remove or inspect the hook:

```bash
mergeguard hook status
mergeguard hook uninstall
```

## GitHub Actions

Generate a minimal workflow:

```bash
mergeguard ci github
```

The workflow checks out full history, installs the CLI, and runs the exact same engine against the PR merge-base. Make the MergeGuard job a required status check in branch protection if you want enforcement.

A basic workflow is also included at [`examples/github/mergeguard.yml`](examples/github/mergeguard.yml).

## GitLab CI

Generate a job:

```bash
mergeguard ci gitlab
```

The GitLab form emits Code Quality JSON as an artifact while still using the CLI exit code for blocking. See [`examples/gitlab/mergeguard.yml`](examples/gitlab/mergeguard.yml).

## Configuration

Create `.mergeguard.yml`:

```bash
mergeguard init
```

Example:

```yaml
version: 1
fail_on: high
verifier:
  engine: auto
confidence: 0.62

ignore:
  paths:
    - node_modules/**
    - vendor/**
    - dist/**
    - generated/**

review:
  correctness: true
  security: true
  concurrency: true
  database: true
  authorization: true
  tenant-isolation: true
  reliability: true
  performance: true
  api: true
```

`fail_on` can be `critical`, `high`, `medium`, `low`, `info`, or `none`.

### Verifiers

`offline` is deterministic and always available. `auto` uses locally installed Laya when it is available and otherwise falls back to offline verification. `laya` requires Laya and fails if it cannot run. `jev` uses the existing TypeSafe/Jev HTTP API and requires `TYPESAFE_API_KEY` or `JEV_API_KEY`.

Install Laya locally:

```bash
python -m pip install laya
mergeguard doctor
mergeguard review --verifier laya
```

On first model-backed use, Laya may download its checkpoint into the normal local Hugging Face cache. Later runs can use the cached model. MergeGuard communicates with Laya over stdin/stdout via a short-lived local Python process; it does **not** start an HTTP service.

You can select a Python executable in `.mergeguard.yml`:

```yaml
laya:
  python: /path/to/python
  model: typed-decisions
  max_len: 4096
```

## Programmatic API

The CLI is only a wrapper around the review engine:

```js
import { review } from "mergeguard";

const result = await review({
  cwd: process.cwd(),
  base: "origin/main",
  head: "HEAD",
  verifier: "offline",
});

if (result.blocking) process.exitCode = 1;
```

This is the integration point for a custom pipeline, build system, IDE extension, or internal developer platform.

## Repository coverage

MergeGuard's **execution model is repository-agnostic**: it works from Git diffs and text, so it can run in Node, Python, Java/Kotlin, Go, PHP, Ruby, .NET, Rust, C/C++, SQL/migration, mixed-language, and monorepo repositories.

Semantic depth is not identical for every framework. The universal detector layer covers language-independent risks and several language-specific sinks; the context resolver recognizes common manifests/frameworks/ORMs and supplies nearby schema/auth/data-access evidence. New framework-specific detectors can be added without changing the CLI or CI integration.

See [`docs/DETECTORS.md`](docs/DETECTORS.md) for the current coverage and limitations.

## Why this instead of writing a pipeline rule?

CI is orchestration. A line such as `run: mergeguard review` is easy; the reusable product is everything behind it: Git range handling, changed-line detection, cross-language security/correctness rules, repository-context resolution, semantic verification, deduplication, confidence/severity policy, hook behavior, SARIF/GitLab adapters, and stable exit semantics.

MergeGuard is meant to sit next to your existing compiler, linter, tests, dependency scanner, and SAST tooling—not replace them.

## Design principles

1. **Local first.** Source code does not need to leave the machine in offline/Laya mode.
2. **Diff first.** Findings must relate to the change under review.
3. **Concrete failure modes.** Do not report style opinions as defects.
4. **High signal over volume.** Suppress ambiguous candidates rather than flooding reviewers.
5. **One engine everywhere.** Local, pre-push, GitHub, GitLab and custom CI execute the same core.
6. **No infrastructure tax.** No DB, Redis, worker, web server, dashboard or webhook service is needed.

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

No dependency installation is needed for the test suite on Node 20+.

## License

Apache-2.0.
