# Detector coverage

MergeGuard runs only against changed content/diff regressions and then adds bounded repository context.

## High-signal categories

| Category | Examples |
|---|---|
| Security | dynamic evaluation, SQL injection candidates, shell injection, TLS verification disabled, raw HTML, unsafe deserialization, path traversal, sensitive logging |
| Authorization | auth guard/policy removal, anonymous/public access introduced, token decode without visible verification |
| Tenant isolation | tenant/organization/owner predicates removed; repository-aware missing isolation candidates |
| Concurrency | check-then-create, read-check-write, webhook replay/idempotency candidates |
| Database | transaction removal, multi-write atomicity, broad delete/update, uniqueness removal, risky migrations |
| Correctness/reliability | async forEach, swallowed exceptions, unsafe retry behavior, input-validation removal, hard-coded local endpoints |
| Performance | N+1 query candidates, unbounded async fan-out, potentially blocking index creation |

## Language-aware rules

The generic layer runs in any text Git repository. Additional direct rules currently recognize JavaScript/TypeScript, Python, Java/Kotlin, Go, PHP, Ruby, C#, SQL and common configuration forms. C/C++, Rust and other languages still benefit from generic diff-regression, TLS/SQL/configuration, repository and migration checks, but have fewer syntax-specific rules today.

## Stack/context recognition

The context resolver recognizes common signals for NestJS, Next.js, Express, Fastify, Django, FastAPI, Flask, Spring, Laravel, Symfony, Rails, ASP.NET Core, Gin/Fiber, Actix/Axum; Prisma, TypeORM, Sequelize, SQLAlchemy, Entity Framework, GORM, Hibernate, Diesel/SQLx; PostgreSQL, MySQL/MariaDB, MongoDB, SQLite and Redis.

Recognition does not imply perfect semantic parsing. It is used to select useful evidence and reduce false positives.

## What is intentionally excluded

MergeGuard does not compete with formatters/linters on formatting, naming, import order, line length or generic maintainability opinions. It also does not include a vulnerability-database service, dependency CVE feed, secret-management backend, compiler or test runner.
