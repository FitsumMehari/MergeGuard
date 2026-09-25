export function githubWorkflow() {
  return `name: MergeGuard\n\non:\n  pull_request:\n\npermissions:\n  contents: read\n\njobs:\n  mergeguard:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm install --global mergeguard\n      - name: Review pull request diff\n        run: mergeguard review --base "origin/\${{ github.base_ref }}" --head "\${{ github.event.pull_request.head.sha }}"\n`;
}

export function gitlabWorkflow() {
  return `mergeguard:\n  stage: test\n  image: node:22\n  rules:\n    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'\n  before_script:\n    - npm install --global mergeguard\n    - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"\n  script:\n    - mergeguard review --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --head "$CI_COMMIT_SHA" --format gitlab --output gl-code-quality-report.json\n  artifacts:\n    when: always\n    reports:\n      codequality: gl-code-quality-report.json\n`;
}
