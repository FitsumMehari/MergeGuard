# Limitations

- MergeGuard **runs on arbitrary Git repositories**. It does **not** have equal semantic analysis for every language or framework.
- Detectors produce candidates. The verifier can suppress weak ones. Neither is a formal proof.
- Context is ephemeral and bounded. MergeGuard does not build or persist a whole-repository "project brain."
- Large diffs are truncated (`max_files`). Generated, minified, binary, and excluded paths are skipped.
- First-push and root-commit reviews use Git's empty tree. Shallow clones still need enough history for `--base` merge-base resolution.
- Pre-push hooks can be bypassed with `git push --no-verify`.
- `auto` does not fail when Laya is missing. Only `--verifier laya` (or `verifier.engine: laya`) requires it.
- Jev is optional, network-using, and credential-gated. Default operation never needs it.
