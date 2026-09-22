# GitLab setup

This guide connects one GitLab project to a running MergeGuard instance. Start with a non-critical/internal test repository.

## 1. Requirements

MergeGuard must be running and GitLab must be able to reach its API webhook URL over HTTPS (or over your internal network for self-managed GitLab).

Verify:

```bash
./start.sh prod health
```

## 2. Create a GitLab token

For the first integration, use a project access token/service token when your GitLab edition and organization policy permit it. A personal access token also works for a controlled test, but a project-scoped service credential is preferable.

The current implementation reads repository/MR data and creates MR notes, so configure an API-capable token with access to the target project.

Put it in `.env.production`:

```env
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_TOKEN=glpat-...
```

For GitLab.com use:

```env
GITLAB_BASE_URL=https://gitlab.com
```

Never commit the token.

## 3. Verify the token before involving MergeGuard

Find the numeric project ID in GitLab, then from the MergeGuard server:

```bash
export GITLAB_TOKEN='glpat-...'
export GITLAB_BASE_URL='https://gitlab.example.com'
export PROJECT_ID='123'

curl --fail --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$GITLAB_BASE_URL/api/v4/projects/$PROJECT_ID"

curl --fail --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$GITLAB_BASE_URL/api/v4/projects/$PROJECT_ID/merge_requests"
```

If these fail, fix token/project/network permissions before debugging MergeGuard.

## 4. Create the webhook secret

Generate a secret:

```bash
openssl rand -hex 32
```

Set it in `.env.production`:

```env
GITLAB_WEBHOOK_SECRET=<generated-value>
```

Restart production after changing secrets:

```bash
./start.sh prod restart
```

## 5. Add the GitLab webhook

In the GitLab project, open the project webhook settings and configure:

- URL: `https://mergeguard-api.example.com/webhooks/gitlab`
- Secret token: exactly the value of `GITLAB_WEBHOOK_SECRET`
- Trigger: **Merge request events**
- SSL verification: keep enabled with a valid certificate

The current API reacts to MR `open`, `reopen`, and `update` actions. A new push that updates the MR head should therefore trigger analysis.

## 6. Observe webhook and worker processing

In one terminal:

```bash
./start.sh prod logs api
```

In another:

```bash
./start.sh prod logs worker
```

Create/update an MR. The API should accept the event and queue it; the worker should fetch the MR diff/files, build/load the repository model, analyze it, and publish a note back to the MR.

## 7. Common GitLab failures

| Symptom | Check |
|---|---|
| Webhook returns 401 | `GITLAB_WEBHOOK_SECRET` differs from GitLab webhook secret |
| Webhook cannot connect | DNS/firewall/HTTPS/reverse-proxy configuration |
| Worker reports `Missing GITLAB_TOKEN` | token absent from `.env.production` or service not restarted |
| GitLab API returns 401/403 | token scope, expiry, role, or project access |
| Analysis runs but no MR note | token cannot create notes or project/IID is wrong |
| First review is slow | expected initial repository-index build |
| Repeated identical events | queue/database idempotency should collapse the same head SHA |

Continue with [First live test](FIRST_LIVE_TEST.md).
