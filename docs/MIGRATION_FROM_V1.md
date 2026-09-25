# Migration from the hosted 1.x shape

The previous repository modeled MergeGuard as a hosted review platform. The 2.x local-first shape removes the infrastructure layer and keeps the review capability as a CLI/library.

## Removed

- `apps/api`
- `apps/web`
- `apps/worker`
- database/Prisma persistence
- Redis/BullMQ queues
- webhook receivers
- Docker deployment topology
- dashboard/authentication concerns
- persisted repository indexing and analysis-run history

## Replaced by

- `src/git.js`: Git working/staged/range/pre-push change acquisition
- `src/detectors/*`: diff and repository-aware candidate detection
- `src/context.js`: bounded ephemeral repository context
- `src/verifiers/*`: deterministic, local Laya and optional Jev verifier contract
- `src/reporters/*`: terminal, JSON, SARIF and GitLab Code Quality
- `src/hook.js`: composable pre-push installation
- `src/review.js`: one reusable engine used by CLI and JS API

The migration intentionally does not preserve hosted analysis history because persistence is not required by the core product. If a future organization dashboard is needed, it should consume MergeGuard's JSON/SARIF output as a separate optional product rather than being required to run the analyzer.
