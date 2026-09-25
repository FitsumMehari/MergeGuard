# Contributing

Thanks for helping with MergeGuard.

## Product boundary

MergeGuard is a local-first Git diff review gate. Do not add servers, databases, dashboards, queues, webhooks, or hosted GitHub/GitLab backends.

Keep the CLI/library lightweight. Prefer the Node.js standard library. Do not add a runtime dependency unless it is clearly necessary.

## Development

Requires Node.js 20+ and Git.

```bash
npm test
npm run check
```

No `npm install` is required for the core package itself (zero runtime dependencies). Tests create temporary Git repositories and must not modify this checkout.

## Adding detectors

- Target a concrete failure mode, not style.
- Include a true-positive fixture and a false-positive (safe equivalent) test.
- Prefer fewer strong findings over speculative volume.
- Keep language adapters behind the existing candidate → verifier → finding pipeline.

## Pull requests

- Keep changes focused.
- Update tests for any detector, Git, hook, reporter, or public API change.
- Do not commit `.env`, credentials, model caches, or packed tarballs.

Report security issues through GitHub's private vulnerability reporting rather than a public issue. See [SECURITY.md](SECURITY.md).
