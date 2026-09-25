# Changelog

All notable changes to this project are documented in this file.

This project follows [Semantic Versioning](https://semver.org/). `0.1.0` is the first public beta. There is no prior public npm release of this local-first CLI.

## 0.1.0

First public beta of MergeGuard as a local-first semantic pre-push / code-change gate.

- Single review engine shared by the CLI, Git pre-push hook, GitHub Actions, GitLab CI, generic CI, and the Node API
- Working-tree, staged, `--base`/`--head`, and pre-push Git scopes, including first commits and first pushes against Git's empty tree
- High-signal detectors for security, authorization, tenant isolation, concurrency, database integrity, and related runtime risk
- Bounded ephemeral repository context (no persisted project database)
- Published as `@fitsummehari/mergeguard` (CLI binary remains `mergeguard`; unscoped `mergeguard` is a different npm package)
- Deterministic `offline` verifier by default (reproducible); `auto` and local Laya optional; optional Jev
- Terminal, JSON, SARIF, and GitLab Code Quality reporters
- Non-destructive, idempotent hook install/uninstall that respects `core.hooksPath`
- Zero runtime npm dependencies; Node.js 20+; Laya model weights are not bundled
