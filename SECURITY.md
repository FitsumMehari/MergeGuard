# Security

MergeGuard reviews untrusted repository text. That text is evidence only. It is never executed, never sourced as configuration code, and never treated as verifier instructions.

## Reporting a vulnerability

This project does not publish a dedicated security email. Please use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on [FitsumMehari/MergeGuard](https://github.com/FitsumMehari/MergeGuard/security/advisories/new) if the repository has that feature enabled.

Maintainers: enable **Settings → Code security → Private vulnerability reporting** so researchers have a private channel.

If private reporting is unavailable, open a GitHub issue titled "Security: please contact maintainers" with no exploit details and wait for a maintainer to reply privately.

## Privacy model

- **Offline / deterministic:** no network calls.
- **Laya:** local Python process. Laya/Hugging Face may download a model checkpoint into a local cache on first use.
- **Jev:** explicit opt-in. Candidate context is sent to the configured HTTP API. Credentials come from `TYPESAFE_API_KEY` or `JEV_API_KEY` and must not be placed in `.mergeguard.yml` or committed.

Do not include secrets in reports, fixtures, or configuration examples.

## Trust boundary

- Git filenames, diffs, and file contents from the reviewed repository are untrusted.
- MergeGuard must not run scripts from that repository.
- Analyzed paths are constrained to the repository root.
- Binary, oversized, and ignored files are skipped.
