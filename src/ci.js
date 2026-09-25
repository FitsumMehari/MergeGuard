export function githubWorkflow() {
  return `name: MergeGuard

on:
  pull_request:

permissions:
  contents: read
  security-events: write

jobs:
  mergeguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install MergeGuard
        run: npm install --save-dev mergeguard
      - name: Review pull request diff
        run: npx mergeguard review --base "origin/\${{ github.base_ref }}" --head "\${{ github.event.pull_request.head.sha }}"
      - name: Write SARIF
        if: always()
        run: npx mergeguard review --base "origin/\${{ github.base_ref }}" --head "\${{ github.event.pull_request.head.sha }}" --fail-on none --format sarif --output mergeguard.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        continue-on-error: true
        with:
          sarif_file: mergeguard.sarif
`;
}

export function gitlabWorkflow() {
  return `mergeguard:
  stage: test
  image: node:22
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  before_script:
    - npm install --save-dev mergeguard
    - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
  script:
    - npx mergeguard review --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --head "$CI_COMMIT_SHA" --format gitlab --output gl-code-quality-report.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality-report.json
`;
}
