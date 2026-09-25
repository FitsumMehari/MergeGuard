# Releasing MergeGuard

`0.1.0` is the first public beta. Published versions cannot be reused on npm.

**Registry name:** `@fitsummehari/mergeguard`  
**Product / CLI:** MergeGuard / `mergeguard`

The unscoped name `mergeguard` is owned by another package. Publish under this scope with `--access public`.

## Manual publish

```bash
npm login
npm whoami   # expect: fitsummehari
npm view @fitsummehari/mergeguard   # expect 404 until first publish

git status
npm run check
npm pack --dry-run
npm pack

# Fresh-install smoke outside this repo:
# npm install /absolute/path/to/fitsummehari-mergeguard-0.1.0.tgz
# npx mergeguard --version
# npx mergeguard --help
# npx mergeguard doctor

npm publish --dry-run
npm publish --access public
git tag v0.1.0
git push origin v0.1.0
```

After a local install, `npx mergeguard` is safe. A one-off without install must be:

```bash
npx --package=@fitsummehari/mergeguard mergeguard review
```

## Trusted publishing

1. npm → package `@fitsummehari/mergeguard` → Trusted Publishing → this GitHub repository and the `Release` workflow
2. GitHub → Settings → Environments → `npm`
3. Publish a GitHub Release for `vX.Y.Z`
4. [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs `npm publish --provenance --access public`

Do not commit an npm auth token.

## Rollback

```bash
npm deprecate @fitsummehari/mergeguard@0.1.0 "Broken release; use 0.1.1"
```

Then publish `0.1.1`. Versions cannot be reused.
