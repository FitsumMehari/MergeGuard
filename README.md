# MergeGuard

MergeGuard is a local-first semantic code-change gate that catches high-impact bugs before code is pushed or merged.

It reviews a Git diff — not an entire repository — for concrete runtime risks such as authorization regressions, tenant-isolation holes, check-then-write races, unsafe SQL or shell construction, and removed transaction boundaries. It is not a SaaS platform and not a style linter.

```text
Git diff
   ↓
MergeGuard review engine
   ├── deterministic/static detectors
   ├── repository/context resolver
   └── optional semantic verifier
         ├── local Laya
         └── optional Jev/provider
   ↓
normalized findings
   ↓
terminal / JSON / SARIF / GitLab
   ↓
PASS / BLOCK
```

The same engine is used by the CLI, a Git pre-push hook, GitHub Actions, GitLab CI, other CI systems, and the programmatic Node API.

```bash
npm install -D @fitsummehari/mergeguard
npx mergeguard review
```

Requires only **Node.js 20+** and **Git** for the default offline experience. The CLI binary is `mergeguard`; the npm package is scoped because the unscoped name is owned by a different project.

## Why it exists

Compilers, tests, and formatters do not reliably catch "this change will fail under concurrency" or "this query no longer filters by tenant." MergeGuard sits in front of `git push` and CI so those classes of defect can block the change with a normal process exit code. No MergeGuard server, database, dashboard, GitHub App, or webhook service is required.

## What it catches

High-signal, change-scoped risks, including:

- authorization / route-protection regressions
- tenant or ownership filter removal
- check-then-create and read-check-write races
- missing uniqueness / idempotency around creates and webhooks
- removed transaction boundaries and non-atomic related writes
- unbounded deletes or empty-filter updates
- SQL injection, command injection, dynamic evaluation
- unsafe deserialization and path traversal
- XSS / raw HTML sinks where the sink is visible
- disabled TLS verification
- async `forEach`, swallowed errors, N+1 query and unbounded fan-out candidates
- validation removal and insecure framework markers such as `@Public()` / `[AllowAnonymous]`

## What it deliberately does not catch

MergeGuard is not a style linter and will not report:

- semicolons, quotes, import order, or naming taste
- formatting or line length
- generic "consider refactoring" advice
- documentation nags
- arbitrary function-length opinions
- subjective AI code-review commentary

It is also not a CVE database, secret scanner, compiler, or test runner.

## Installation

```bash
npm install -D @fitsummehari/mergeguard
npx mergeguard review
```

Zero runtime npm dependencies. Python is **not** required for default operation.

### One-off invocation without a local install

Do **not** run bare `npx mergeguard` before installing — npm may resolve the unrelated unscoped `mergeguard` package.

```bash
npx --package=@fitsummehari/mergeguard mergeguard review
```

After a normal local install, `npx mergeguard review` is correct because npm uses the local binary.

### From this source tree

```bash
node bin/mergeguard.js review
```

## 30-second quick start

```bash
cd your-git-repo
npm install -D @fitsummehari/mergeguard
npx mergeguard review
```

That reviews the working tree (staged, unstaged, and untracked) against `HEAD`. Exit `0` means pass. Exit `1` means a blocking finding. Exit `2` means MergeGuard or the environment failed. The default verifier is **offline** (reproducible across machines).

## Local review

```bash
npx mergeguard review
npx mergeguard review --staged
npx mergeguard review --base origin/main
npx mergeguard review --base origin/main --head HEAD
npx mergeguard review --verifier offline
```

`--no-ai` and `--verifier offline` / `--verifier deterministic` force the built-in verifier.

## Pre-push hook

```bash
npx mergeguard hook install
npx mergeguard hook status
npx mergeguard hook uninstall
```

Install is idempotent and will not overwrite an existing pre-push hook. It appends a marked MergeGuard block and respects `core.hooksPath` when set. The hook reads Git's pre-push stdin and reviews the outgoing commit range, including first pushes (diffed against Git's empty tree).

If MergeGuard blocks a push, it tells you how to bypass **only when relevant**:

```bash
git push --no-verify
```

Use CI as the enforcement layer. Local hooks are a convenience, not a security boundary.

## GitHub Actions

```bash
npx mergeguard ci github --write
```

Or copy [`examples/github/mergeguard.yml`](examples/github/mergeguard.yml). Default templates install `@fitsummehari/mergeguard`, pin `--verifier offline`, and can upload SARIF. Make the job a required check if you want enforcement. Optional Laya-in-CI recipes are in [docs/LAYA.md](docs/LAYA.md).

## GitLab CI

```bash
npx mergeguard ci gitlab --write
```

Or copy [`examples/gitlab/mergeguard.yml`](examples/gitlab/mergeguard.yml). The job writes GitLab Code Quality JSON as an artifact and still uses the CLI exit code to block.

## Other CI

Any runner with Git and Node 20+ can run the same engine after installing the scoped package:

```bash
npm install -D @fitsummehari/mergeguard
npx mergeguard review --verifier offline --base <base> --head <head>
```

That works on Jenkins, CircleCI, Azure DevOps, Bitbucket, Buildkite, and custom CI. No provider credentials are required for offline verification.

## Configuration

Zero-config defaults to the offline verifier. To pin policy:

```bash
npx mergeguard init
```

This writes `.mergeguard.yml` and will not overwrite an existing file unless you pass `--force`.

```yaml
fail_on: high

exclude:
  - dist/**
  - build/**
  - generated/**
  - vendor/**
  - node_modules/**

review:
  security: true
  correctness: true
  concurrency: true
  database: true
  performance: true

verifier:
  engine: offline
```

`fail_on` may be `critical`, `high`, `medium`, `low`, `info`, or `none`. Unknown root keys produce a warning. Malformed YAML reports the file path and line. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

`auto` is available but environment-dependent (uses Laya when installed). Prefer pinning `offline` or `laya` for team/CI reproducibility. `mergeguard doctor` shows configured vs effective verifier.

## Output formats

```bash
npx mergeguard review --format terminal
npx mergeguard review --format json
npx mergeguard review --format sarif --output mergeguard.sarif
npx mergeguard review --format gitlab --output gl-code-quality-report.json
```

Machine-readable formats write only the report to stdout (or `--output`). Status goes to stderr so JSON/SARIF/GitLab output stays parseable.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Review completed; no blocking finding |
| `1` | Review completed; policy blocked the change |
| `2` | MergeGuard, config, Git, or runtime failure |

## Optional Laya

Laya is **not** bundled with the npm package. MergeGuard works without it. Keeping model weights out of npm keeps the install small (~40 KB) and lets default CI run on Node alone.

```bash
python -m pip install laya
npx mergeguard doctor
npx mergeguard review --verifier laya
```

`--verifier laya` exits `2` with an install hint if Laya is missing. It does **not** silently fall back. See [docs/LAYA.md](docs/LAYA.md).

MergeGuard talks to Laya through a short-lived local Python process over stdin/stdout. It does not start an HTTP server. First model use may download a checkpoint into the Hugging Face cache.

## Optional Jev

Jev is opt-in and never required for default operation.

```bash
export TYPESAFE_API_KEY=...   # or JEV_API_KEY
npx mergeguard review --verifier jev
```

Jev sends candidate evidence to the configured HTTP API. Secrets are read from the environment and are not printed.

## Programmatic API

```js
import { review } from "@fitsummehari/mergeguard";

const result = await review({
  cwd: process.cwd(),
  base: "origin/main",
  head: "HEAD",
});

// result.passed, result.findings, result.summary, result.metadata
if (!result.passed) process.exitCode = 1;
```

Also exported: `reviewChangeSet`, `loadConfig`, `normalizeConfig`, `renderReport`, `toSarif`, `toGitLabCodeQuality`, `detectLaya`, `VERSION`. Everything else is internal.

## Language-support philosophy

MergeGuard **runs on any normal Git repository**. That is not the same as equal deep semantics for every language.

JavaScript, TypeScript, Python, Java, Kotlin, Go, C#, PHP, Ruby, and SQL have additional syntax-aware rules. Rust, C, C++, shell, YAML, JSON, Terraform, Dockerfiles, and mixed monorepos still get generic analysis and must not crash merely because a deeper adapter is missing.

## Limitations

- Findings are candidates plus a verifier, not proofs.
- Context is bounded — not a persisted project database.
- Huge diffs are truncated; generated/minified/binary paths are skipped.
- Local hooks can be bypassed with `--no-verify`.
- Semantic depth varies by language and framework.

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and [docs/DETECTORS.md](docs/DETECTORS.md).

## Security and privacy

Analyzed repository text is treated as untrusted data, never as instructions or executable code. Offline mode makes no network calls. Laya mode stays on the machine aside from Laya/Hugging Face model-cache behavior. Jev mode is explicit and sends candidate context to the configured API.

Do not put credentials in `.mergeguard.yml`. See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/FitsumMehari/MergeGuard.git
cd MergeGuard
npm test
npm run check
```

## License

[MIT](LICENSE)
