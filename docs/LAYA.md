# Optional Laya verification

Laya is **not** bundled in the MergeGuard npm package. Detectors run in Node. Laya is an optional verifier that answers narrow questions (plausible, reachable, already protected, impact, worth reporting) about those candidates.

MergeGuard works with **Node.js 20+ and Git only**. Python and Laya are extra.

```bash
python -m pip install laya
npx mergeguard doctor
npx mergeguard review --verifier laya
```

On first model-backed use, Laya may download a checkpoint into its normal local Hugging Face cache. Later runs can reuse that cache. Do not commit model files. Do not put hundreds of millions of parameters into the npm tarball.

## Reproducibility

Default for 0.1.0 is `offline` so laptop and CI agree without Python.

`auto` uses Laya when it is importable and otherwise falls back to offline. That can make environments disagree. Prefer pinning:

```yaml
verifier:
  engine: offline
```

or, if every environment installs Laya:

```yaml
verifier:
  engine: laya
```

`mergeguard doctor` shows configured vs effective verifier.

## Optional GitHub Actions (Laya)

Do **not** add this to the default lightweight workflow.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm install --save-dev @fitsummehari/mergeguard
- uses: actions/setup-python@v5
  with:
    python-version: "3.11"
- run: python -m pip install laya
- uses: actions/cache@v4
  with:
    path: |
      ~/.cache/huggingface
    key: laya-hf-${{ runner.os }}
- run: npx mergeguard review --verifier laya --base "origin/${{ github.base_ref }}" --head "${{ github.event.pull_request.head.sha }}"
```

## Optional GitLab CI (Laya)

```yaml
mergeguard-laya:
  image: node:22
  before_script:
    - apt-get update && apt-get install -y python3 python3-pip
    - python3 -m pip install laya
    - npm install --save-dev @fitsummehari/mergeguard
  cache:
    paths:
      - .cache/huggingface/
  variables:
    HF_HOME: "$CI_PROJECT_DIR/.cache/huggingface"
  script:
    - npx mergeguard review --verifier laya --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --head "$CI_COMMIT_SHA"
```

## Future Node-native path

`@receptron/laya` exists on npm (0.1.x) and can load ONNX weights from a local cache. That release is too early to take as a MergeGuard runtime dependency. 0.1.0 keeps the Python subprocess bridge. A later version may optionally call:

```text
MergeGuard Node → Laya ONNX/TypeScript runtime → model cached locally
```

without putting hundreds of millions of parameters inside the npm tarball.
