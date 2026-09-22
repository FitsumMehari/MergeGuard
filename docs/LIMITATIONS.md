# Limitations and roadmap

MergeGuard is designed to find meaningful review risks, but it cannot guarantee that code is bug-free or secure.

## Current limitations

### No complete whole-program call/data-flow engine

The current repository model contains imports, framework facts and selected relationships, but it is not yet a full interprocedural compiler-quality call/data-flow graph across every package.

### Framework depth varies

NestJS/Prisma/monorepo/Docker/Nginx support is intentionally prioritized. Next.js and generic ORM/infra handling are useful but not yet exhaustive for every framework-specific semantic.

### Business logic intent is not automatically known

MergeGuard can reason about code evidence, patterns and repository conventions. It cannot know undocumented business requirements with certainty.

### Jev verification is probabilistic

Jev reduces ambiguous false positives through structured judgments; it does not turn uncertain semantic reasoning into mathematical proof.

### No sandboxed generated-test execution yet

The product can identify edge-case/reproduction ideas, but this release does not clone base/head into an isolated sandbox and prove regressions by executing generated tests.

## High-value roadmap

1. richer TypeScript symbol/call graph;
2. framework-aware data-flow and authorization tracing;
3. incremental symbol graph updates between head SHAs;
4. optional Semgrep/CodeQL/SARIF evidence ingestion;
5. base-vs-head sandbox test execution;
6. organization-level suppression/feedback learning;
7. multi-tenant SaaS auth/RBAC;
8. deeper Next.js server action/middleware/cache semantics;
9. deeper TypeORM/Drizzle/MariaDB migration semantics;
10. review-quality telemetry by detector and repository.

## Product quality philosophy

A useful reviewer should prefer:

```text
4 real findings + 1 false positive
```

over:

```text
8 real findings + 80 speculative comments
```

Precision and evidence are more valuable than maximizing comment count.
