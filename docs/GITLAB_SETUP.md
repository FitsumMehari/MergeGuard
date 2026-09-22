# GitLab setup

Connect **any number of GitLab projects** (or a whole group) to one MergeGuard instance. Every merge-request open/update is analyzed with the same pipeline. Nest/TypeORM intelligence is extra context when that stack is present; other repos still get the generic detectors.

## 1. Requirements

```bash
./start.sh prod health
```

GitLab must reach `https://YOUR_API_HOST/webhooks/gitlab`.

## 2. Token that can see every connected project

Use a **group access token** (or a bot user) with `api` scope on the group that owns QuizLand and the other repos.

```env
GITLAB_BASE_URL=https://repo.teleport.et
GITLAB_TOKEN=glpat-...
```

If some projects need a different token:

```env
GITLAB_PROJECT_TOKENS={"123":"glpat-project-a","456":"glpat-project-b"}
```

Unlisted projects fall back to `GITLAB_TOKEN`.

Verify one project:

```bash
curl --fail --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$GITLAB_BASE_URL/api/v4/projects/$PROJECT_ID/merge_requests"
```

## 3. Webhook secret

```bash
openssl rand -hex 32
```

```env
GITLAB_WEBHOOK_SECRET=<generated-value>
```

```bash
./start.sh prod restart
```

## 4. Attach every project (or the group)

**Preferred:** group webhook (Settings → Webhooks) so every project in the group is covered without per-repo setup.

- URL: `https://YOUR_API_HOST/webhooks/gitlab`
- Secret token: exactly `GITLAB_WEBHOOK_SECRET`
- Trigger: **Merge request events**
- SSL verification: on

You can also add the same webhook on individual projects.

MergeGuard accepts MR `open`, `reopen`, `update`, and `ready` from any project id in the payload. Draft MRs are analyzed too. The same head SHA is not analyzed twice.

## 5. What every MR gets

Regardless of stack:

- changed-file fetch (paginated)
- generic + TypeScript AST detectors
- risk score, GitLab note, dashboard row

If the repo looks like QuizLand (Lerna/Nest/TypeORM), it also gets route/guard/entity/alias context. If indexing fails, the MR is still reviewed from the diff alone.

## 6. Watch a live MR

```bash
./start.sh prod logs api
./start.sh prod logs worker
```

Open or push to an MR in **any** connected project. You should see `analysis_started` with that repository name, then a note on the MR.

## 7. Common failures

| Symptom | Check |
|---|---|
| Webhook 401 | secret mismatch |
| One project 401/403, others fine | token cannot see that project; add `GITLAB_PROJECT_TOKENS` |
| No note | token cannot create notes |
| First MR on a repo is slow | first base-SHA index |
| Same head twice | idempotent; expected |

Continue with [First live test](FIRST_LIVE_TEST.md) on two different projects, not only QuizLand.
