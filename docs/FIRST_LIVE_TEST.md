# First live end-to-end test

Use this checklist after completing [GitLab setup](GITLAB_SETUP.md) or [GitHub setup](GITHUB_SETUP.md). The goal is to prove every component works before enabling MergeGuard broadly.

## 1. Confirm the stack

```bash
./start.sh prod status
./start.sh prod health
```

You should have healthy/running PostgreSQL, Redis, API, worker and dashboard services. `/health/ready` must succeed.

## 2. Confirm Jev configuration

For a real production-path test use:

```env
TYPESAFE_API_KEY=<your-key>
REQUIRE_JEV=true
JEV_FAIL_OPEN=false
```

Then:

```bash
./start.sh prod restart
```

With these values, a Jev failure causes the semantic-verification step to fail instead of silently presenting an offline-only review as fully verified.

## 3. Create a deliberately testable branch

Do not start with a random clean change. Add one obvious issue that a deterministic detector should recognize.

### Example A: async `forEach`

```ts
users.forEach(async (user) => {
  await mailer.send(user);
});
```

The callback promises are not awaited by `forEach`; MergeGuard should create an async-control-flow candidate.

### Example B: N+1-style database work

```ts
for (const user of users) {
  await prisma.order.findMany({ where: { userId: user.id } });
}
```

This should produce a performance/scalability candidate.

### Example C: check-then-create race

```ts
const existing = await prisma.user.findUnique({ where: { email } });
if (!existing) {
  await prisma.user.create({ data: { email } });
}
```

Repository constraints and surrounding transaction/uniqueness context affect the final severity, but the pattern should be considered.

## 4. Open the PR/MR

Keep two log terminals open:

```bash
./start.sh prod logs api
```

```bash
./start.sh prod logs worker
```

Then open a GitHub PR or GitLab MR.

## 5. Expected pipeline

```text
provider webhook
  → MergeGuard API verifies secret/signature
  → idempotent BullMQ job is created
  → worker normalizes PR/MR data
  → base repository index is loaded or built
  → changed files are overlaid
  → static/AST/repository-aware detectors run
  → ambiguous candidates are verified with Jev
  → findings/risk are persisted
  → GitHub Check or GitLab MR note is published
```

The first review for a repository/base SHA can be slower because the repository intelligence model is created. Later reviews reuse the cached base model and overlay changed files.

## 6. Verify the output

A useful finding should include concrete evidence such as category, severity, confidence, file/location, description, and—when available—repository context/remediation. MergeGuard deliberately says **potential issue** rather than claiming formal proof.

## 7. Push a second commit

Fix the deliberately introduced issue and push again. This tests update events and head-SHA idempotency. You should get a new analysis for the new head, while duplicate deliveries for the same head should not create duplicate analysis runs.

## 8. Evaluate the first 10–30 reviews

Before enabling MergeGuard organization-wide, label findings internally as:

- correct and useful;
- correct but low-value;
- false positive;
- already protected elsewhere;
- missed expected issue.

Tune confidence thresholds and repository/framework logic based on real results. High precision is more important than producing many comments.

## 9. Go/no-go checklist

- [ ] `./start.sh prod health` passes
- [ ] provider can reach webhook endpoint
- [ ] webhook secret/signature validates
- [ ] worker consumes jobs
- [ ] repository index builds successfully
- [ ] Jev verification succeeds
- [ ] result is persisted
- [ ] result appears in GitHub/GitLab
- [ ] second push triggers exactly one new head analysis
- [ ] findings are understandable and actionable

If a step fails, use [Troubleshooting](TROUBLESHOOTING.md).
