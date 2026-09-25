# Configuration

MergeGuard works with no config file. When present, it reads the first of:

- `.mergeguard.yml`
- `.mergeguard.yaml`
- `.mergeguard.json`

Or `--config PATH`. `mergeguard init` writes a conservative `.mergeguard.yml` and refuses to overwrite unless `--force` is passed.

## Defaults

| Field | Default | Notes |
| --- | --- | --- |
| `fail_on` | `high` | Also accepts `failOn`. Values: `critical`, `high`, `medium`, `low`, `info`, `none` |
| `verifier.engine` | `offline` | `offline` (default, reproducible), `deterministic` (alias), `auto` (Laya if installed), `laya`, `jev` |
| `confidence` | `0.62` | Verifier strength threshold in `0..1` |
| `exclude` | `node_modules/**`, `vendor/**`, `dist/**`, `build/**`, `coverage/**`, `.next/**`, `.git/**`, `**/*.min.js`, `**/*.map`, `**/generated/**` | Also accepts `ignore` / `ignore.paths` |
| `review.*` | all categories `true` | Disable a category with `false` |
| `max_files` | `300` (cap 5000) | Changed files analyzed |
| `max_candidates` | `120` (cap 1000) | Detector candidates kept |
| `context_files` | `24` (cap 100) | Nearby files loaded as evidence |
| `context_chars` | `18000` (cap 200000) | Evidence budget per candidate |

Unknown root keys are ignored with a warning that includes the config path.

## Example

```yaml
fail_on: high
exclude:
  - dist/**
  - generated/**
review:
  security: true
  performance: false
verifier:
  engine: offline
laya:
  python: python3
  max_len: 4096
```

## Environment

| Variable | Purpose |
| --- | --- |
| `MERGEGUARD_PYTHON` | Python executable for Laya |
| `MERGEGUARD_LAYA_TIMEOUT_MS` | Laya subprocess timeout (default 180000) |
| `MERGEGUARD_JEV_TIMEOUT_MS` | Jev HTTP timeout (default 30000) |
| `TYPESAFE_API_KEY` / `JEV_API_KEY` | Jev only |
| `MERGEGUARD_BIN` | Pre-push hook executable override |
| `MERGEGUARD_REMOTE` | Remote name passed into the hook |
| `MERGEGUARD_DEBUG=1` | Print stack traces on CLI failures |
| `NO_COLOR` | Disable ANSI color |

## Limits

Tracked-file scoring for context is capped at 4000 paths. Individual file reads stop at 2 MiB and skip binary (NUL) content. Symlinks that escape the repository root are not read.
