# Product direction

MergeGuard is an evidence-first PR/MR reviewer. It prioritizes concrete correctness, security, concurrency, database, performance, scalability and reliability problems over generic style commentary.

The Jev edition intentionally separates discovery from judgment:

1. ordinary code identifies suspicious structures;
2. AST/pattern detectors create candidates with evidence;
3. Jev judges ambiguous semantics and false-positive risk;
4. deterministic templates explain the finding;
5. risk is derived from reported findings.

This design keeps variable AI cost low and makes most of the product value live in the detector/repository-analysis engine rather than a prompt to a general-purpose model.

## Near-term roadmap

- clone base/head revisions into ephemeral analysis workspaces;
- build import/symbol/call graphs;
- add framework-aware Express/Next.js/Prisma/Drizzle detectors;
- ingest optional Semgrep/CodeQL/SARIF evidence;
- incremental analysis between successive head SHAs;
- organization suppression/feedback rules;
- edge-case test generation from templates and sandbox execution;
- base-vs-head regression confirmation;
- richer GitLab inline discussions;
- cost/latency/accuracy telemetry per detector and Jev decision.
