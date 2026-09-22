# Review examples

These examples illustrate the kinds of evidence MergeGuard is designed to surface. Exact output depends on repository context and Jev verification.

## 1. Authorization / IDOR candidate

Changed NestJS route:

```ts
@UseGuards(JwtAuthGuard)
@Get(':id')
getInvoice(@Param('id') id: string) {
  return this.invoiceService.findById(id);
}
```

Repository context shows authentication but no visible ownership/permission guard, and the query filters only by invoice ID.

Possible report:

```text
HIGH — Possible cross-user resource access

The route is authenticated, but the relevant path does not show a
resource-level ownership/permission check. An authenticated user may
be able to request another invoice ID.

Evidence:
- JwtAuthGuard authenticates the caller
- route parameter controls invoice ID
- downstream query filters by ID only
- no owner/tenant predicate found in the relevant path
```

If the repository model finds `InvoiceOwnershipGuard`, the finding should be suppressed or reduced.

## 2. Tenant isolation anomaly

Most repository queries are:

```ts
where: { id, organizationId }
```

A PR introduces:

```ts
return prisma.order.findMany({
  where: { status: 'OPEN' }
});
```

Possible report:

```text
HIGH — Possible missing tenant scope

The Order model is normally queried with organizationId in this
repository. This changed query does not contain the established tenant
predicate and no equivalent surrounding protection was found.
```

## 3. Check-then-create race

```ts
const user = await repo.findByEmail(email);
if (!user) {
  await repo.create({ email });
}
```

If the database model has no unique constraint on `email`, MergeGuard can report a stronger race candidate. If a unique constraint exists, severity/remediation changes because the DB provides a concrete safety boundary.

## 4. Read/check/write race

```ts
const account = await accountRepo.find(id);
if (account.balance >= amount) {
  await accountRepo.update(id, {
    balance: account.balance - amount
  });
}
```

Possible report:

```text
HIGH — Lost-update / concurrent withdrawal candidate

Correctness depends on balance remaining unchanged between the read and
write. No transaction, lock or atomic update was found in the relevant
context.
```

## 5. N+1 database access

```ts
for (const user of users) {
  const orders = await this.orderRepo.findByUser(user.id);
  // ...
}
```

Possible report:

```text
MEDIUM — Potential N+1 database access

A database operation occurs once per loop element. If `users` can grow
with customer data, request I/O grows linearly with collection size.
```

## 6. Unbounded concurrency

```ts
await Promise.all(items.map(item => processItem(item)));
```

If `items` is request/data-driven and no bound exists, MergeGuard can report a scalability candidate instead of objecting to every `Promise.all` use.

## 7. Destructive migration

```sql
ALTER TABLE customers DROP COLUMN legacy_id;
```

Possible report:

```text
HIGH — Destructive schema migration

The migration removes persisted data. Confirm application/read paths,
backfill/export requirements and rollback strategy before deployment.
```

## 8. Unsafe NOT NULL migration

```sql
ALTER TABLE users ADD COLUMN locale VARCHAR(10) NOT NULL;
```

On a populated table this may require a default/backfill or staged migration, depending on engine/version/strategy.

## 9. Redis idempotency

Potentially unsafe:

```ts
const existing = await redis.get(key);
if (!existing) {
  await performAction();
  await redis.set(key, 'done');
}
```

Repository-aware review may look for an established atomic pattern such as `SET ... NX` or a queue/job uniqueness mechanism before reporting.

## 10. Docker/Nginx port drift

Application change:

```diff
- await app.listen(3000)
+ await app.listen(4000)
```

Nginx remains:

```nginx
proxy_pass http://api:3000;
```

Possible report:

```text
HIGH — Reverse-proxy upstream no longer matches application port

The application now listens on 4000 while the Nginx upstream still
points to api:3000. Requests through this proxy are likely to fail.
```

## 11. Async forEach

```ts
users.forEach(async user => {
  await sendWelcomeEmail(user);
});
```

This pattern does not await the asynchronous callbacks as a group. MergeGuard can recommend an explicit loop or a consciously bounded `Promise.all` pattern depending on intended behavior.

## 12. TLS verification disabled

```ts
httpsAgent: new https.Agent({ rejectUnauthorized: false })
```

This is a high-signal security configuration and can be reported deterministically with strong confidence.
