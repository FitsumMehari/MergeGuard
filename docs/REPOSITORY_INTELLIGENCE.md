# Repository intelligence

## Goal

The same line of code can be safe in one architecture and dangerous in another. MergeGuard therefore learns a bounded model of the project before judging ambiguous changes.

## Monorepo discovery

The indexer looks for workspace/project signals such as:

- `pnpm-workspace.yaml`;
- npm/yarn `workspaces`;
- `nx.json`;
- `turbo.json`;
- package manifests and TypeScript configuration.

It builds package/application boundaries and import relationships so a change in a shared package can have a larger blast radius than an isolated leaf package.

## NestJS

The adapter extracts evidence such as:

- controllers;
- routes and HTTP methods;
- `@UseGuards(...)` and related protection indicators;
- services/providers through TypeScript structure/imports.

Example use:

```text
GET /invoices/:id
  → InvoiceController.getOne
  → InvoiceService.getOne
  → repository lookup
```

A missing owner filter may be suspicious, but a visible ownership guard can suppress or reduce the candidate.

## Next.js

The current model detects Next.js applications and route-handler/application boundaries. The architecture is intentionally designed to add deeper knowledge of server actions, middleware, caching/revalidation and server/client boundaries over time.

## Database

For Prisma, MergeGuard extracts models, fields and constraint/index evidence. This helps distinguish a naked check-then-create race from a flow protected by a concrete uniqueness constraint.

PostgreSQL and MariaDB/MySQL are detected from project dependencies/configuration and participate in migration/query analysis.

## Tenant isolation

MergeGuard looks for recurring scoping conventions such as:

```text
tenantId
organizationId
workspaceId
companyId
```

If most accesses to a model are tenant-scoped and a changed query is not, that becomes a repository-aware security candidate rather than an automatic accusation.

## Redis/BullMQ

Redis usage matters for:

- caching;
- locks/idempotency;
- queues;
- distributed state.

Repository evidence can lower a race finding when an established atomic/idempotency mechanism is visible, or raise concern when a new read-then-write sequence bypasses it.

## Docker and Nginx

Infrastructure is part of application behavior. MergeGuard can correlate known listener/upstream ports and report mismatches introduced by a change.

Example:

```text
Nest application listens on 4000
Docker exposes 4000
Nginx proxy_pass still targets api:3000
```

That is a concrete cross-layer regression that file-isolated review can miss.

## Incremental behavior

The base repository model is cached. Changed files are overlaid for the current review, so a newly added controller, schema change or Nginx edit is visible immediately without rebuilding the entire project model.
