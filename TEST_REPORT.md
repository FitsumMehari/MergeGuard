# MergeGuard 2.0 validation report

Validated on Node.js 22.16.0 and Git 2.47.3.

## Automated suite

`npm run check` passes with 15/15 tests covering:

- zero-dependency source syntax validation;
- `.mergeguard.yml` parsing and recursive ignore globs;
- JavaScript, Python, Java, Go, PHP, Ruby and C# high-signal detectors;
- transaction-boundary regression detection;
- repositories with no commits yet;
- working-tree, staged, base/head and pre-push Git scopes;
- first push to a new remote (empty-tree base);
- non-destructive pre-push hook install/uninstall;
- race, TLS and tenant-isolation findings;
- blocking vs non-blocking exit codes;
- JSON, SARIF and GitLab Code Quality serialization.

## Package/install smoke test

The project was packed with `npm pack`, installed from the generated tarball into a fresh unrelated Git repository, and invoked through `node_modules/.bin/mergeguard`.

The installed CLI successfully blocked a deliberately introduced TLS-verification defect.

## Real pre-push smoke test

The packed artifact was installed into a fresh repository, `mergeguard hook install` created the real `.git/hooks/pre-push` integration, and the hook was invoked with Git-format pre-push stdin containing explicit local and remote SHAs. It reviewed exactly the outgoing commit range, detected an introduced `eval(input)` defect, and exited with code `1`, blocking the simulated push.

## Laya status

The included Python bridge passes Python bytecode compilation and follows Laya's current `Router.predict(state, questions, ...)` interface. Laya itself was not installed in the build environment, so an actual model checkpoint inference was not executed here. `mergeguard doctor` correctly reports this and the default `auto` mode falls back to deterministic verification. Explicit `--verifier laya` fails clearly when Laya is unavailable rather than silently pretending model verification occurred.
