# Architecture

MergeGuard 2.x is a single-process CLI/library.

```text
CLI / JS API
    │
    ├─ Git scope resolver
    │    working | staged | branch range | pre-push
    │
    ├─ detector pipeline
    │    pattern detectors
    │    diff-regression detectors
    │    repository-aware detectors
    │
    ├─ context resolver
    │    changed files
    │    nearby files
    │    manifests / schemas / auth / migrations
    │    stack and protection signals
    │
    ├─ verifier
    │    offline (built-in)
    │    Laya (local Python, optional)
    │    Jev (remote, optional compatibility)
    │
    └─ reporters
         terminal | JSON | SARIF | GitLab Code Quality
```

## Deliberately absent

There is no application server, web UI, PostgreSQL schema, Redis cache, BullMQ worker, webhook listener, GitHub App, or GitLab service. These were deployment concerns from the previous hosted-platform shape and are not required to answer the core question: "does this diff introduce a credible defect?"

## Context is ephemeral

Repository context is resolved per review from tracked paths and changed files. High-signal files (manifests, schemas, migrations, auth/security code and nearby files) are prioritized and bounded. Nothing is persisted to a central database.

## Verifier boundary

Detector output is represented as a candidate with a concrete failure mechanism. The verifier answers five narrow questions: plausibility, reachability, impact, existing protection, and worth reporting. This keeps model use bounded and lets the deterministic verifier, local Laya, or a remote compatible provider share the same contract.
