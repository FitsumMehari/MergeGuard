# Releasing MergeGuard

`0.1.0` is the first public beta. Published versions cannot be reused on npm.

## Preconditions

- Working tree is clean
- You can publish the package name that `package.json` uses
- `npm view mergeguard` currently shows an **unrelated** existing package. If you do not own that name, do not run `npm publish` as `mergeguard`. Configure a scoped name you control, or obtain the name, before publishing.
- Node.js 20+

## Manual publish

```bash
git status
npm run check
npm pack --dry-run
npm pack
```

Then, outside this repository, install the generated tarball into a fresh project and confirm:

```bash
npm install /absolute/path/to/mergeguard-0.1.0.tgz
npx mergeguard --version
npx mergeguard --help
npx mergeguard review
```

When that is clean:

```bash
npm login
npm whoami
npm publish --dry-run
npm publish --access public
git tag v0.1.0
git push origin v0.1.0
```

Create a GitHub Release from that tag if you want the optional Release workflow to run.

## Scoped packages

If the public name must be scoped (for example `@you/mergeguard`):

1. Change `package.json` `name` only. Do not rename the product or the `mergeguard` binary unless necessary.
2. `npm publish --access public`
3. Users install with `npm install -D @you/mergeguard` and can still run `npx mergeguard`.

## Trusted publishing (preferred later)

Configure npm trusted publishing so GitHub Actions can publish via OIDC without a stored npm token:

1. npm → package → **Trusted Publishing** → add this GitHub repository and the `Release` workflow
2. GitHub → Settings → Environments → create `npm`
3. Publish a GitHub Release for tag `vX.Y.Z`
4. [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs `npm publish --provenance --access public`

Do not commit an npm auth token.

## After publication

- Update [CHANGELOG.md](../CHANGELOG.md)
- Confirm `npm view <name> version`

## Rollback

npm versions cannot be reused. If `0.1.0` is broken:

```bash
npm deprecate mergeguard@0.1.0 "Broken release; use 0.1.1"
```

Then publish `0.1.1`. Unpublish is only possible under npm's limited time window and should be treated as exceptional.

If the tag was pushed but npm publish failed, fix the problem, publish, and keep the same tag only if it still points at the intended commit. If you already published a different tarball for that version, bump the version.
