# GitHub setup

MergeGuard integrates with GitHub through a GitHub App. This is preferable to storing a developer's personal access token.

## 1. Create a GitHub App

Create a GitHub App in the organization/account that owns the test repository.

Set the webhook URL to:

```text
https://mergeguard-api.example.com/webhooks/github
```

Generate a webhook secret:

```bash
openssl rand -hex 32
```

Use that value in both GitHub and `.env.production`:

```env
GITHUB_WEBHOOK_SECRET=<generated-value>
```

## 2. Repository permissions

The current implementation needs enough permission to:

- read repository contents;
- read pull requests and changed files;
- create Check Runs.

Configure the GitHub App with the minimum permissions that satisfy those operations, typically:

- **Contents: Read-only**
- **Pull requests: Read-only**
- **Checks: Read & write**
- metadata access is provided to GitHub Apps as required by GitHub

Do not grant administration/write permissions that MergeGuard does not use.

## 3. Subscribe to events

Subscribe the App to **Pull request** events. MergeGuard currently reacts to:

- opened;
- reopened;
- synchronize (new commits pushed);
- ready for review.

## 4. Generate/download the private key

GitHub gives the App an App ID and lets you generate a private key. Configure:

```env
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=<same-secret-used-in-GitHub>
```

Protect `.env.production`; the private key grants App authentication capability.

## 5. Install the App

Install the GitHub App on only the repository/repositories you want to test first.

After changing `.env.production`:

```bash
./start.sh prod restart
./start.sh prod health
```

## 6. Test processing

Watch:

```bash
./start.sh prod logs api
```

and:

```bash
./start.sh prod logs worker
```

Open or update a PR. A successful review appears as a **MergeGuard Check Run** attached to the PR head SHA. High-confidence findings with locations can appear as check annotations.

## 7. Common GitHub failures

| Symptom | Check |
|---|---|
| Webhook 401/bad signature | webhook secret mismatch or proxy changed request body |
| GitHub installation-token failure | App ID/private key malformed, key newline escaping, App not installed |
| Cannot fetch contents/PR files | App repository permissions or installation scope |
| Cannot create check run | Checks permission must be read/write |
| PR update not analyzed | Pull request event subscription or action isn't one MergeGuard handles |
| Details link is wrong | set `WEB_URL` to the public dashboard URL |

Continue with [First live test](FIRST_LIVE_TEST.md).
