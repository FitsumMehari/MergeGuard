# Architecture

MergeGuard is a single-process CLI and Node library. There is no application server, database, queue, dashboard, or webhook listener.

```text
CLI / hook / CI / JS API
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
    │    changed files + nearby high-signal files
    │    manifests / schemas / auth / migrations
    │
    ├─ verifier
    │    offline (built-in)
    │    Laya (local Python, optional)
    │    Jev (remote, optional)
    │
    └─ reporters
         terminal | JSON | SARIF | GitLab Code Quality
```

Public library types live in `src/types.js` (`ReviewResult`, `Finding`, `ChangedFile`, severity/category). Additional detectors, language adapters, verifiers, and reporters should plug into this pipeline rather than forking it.

Repository context is resolved per review and discarded. Nothing is persisted.
