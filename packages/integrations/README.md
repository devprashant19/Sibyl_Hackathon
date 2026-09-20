# Sibyl CI integrations

Wrappers that run `sibyl ci` in CI and publish its JUnit report.

## What every wrapper does

```bash
sibyl ci -c sibyl.config.ts --junit reports/sibyl-junit.xml [-n <iterations>] [--seed <seed>] \
  [--strategy ucb1|mcts|bayesian] [--require-upload] [--allow-intermittent]
```

- **Exit code**: `0` when every run passed; `1` when any run failed or errored, when any run was
  intermittent (unless `--allow-intermittent`), or when the config could not be loaded. The JUnit
  report is written before the exit, and every wrapper publishes it even when the step fails.
- **Upload**: set `SIBYL_API_URL` and `SIBYL_API_TOKEN` as CI secrets/variables to upload the session
  to a Sibyl API. Without them the session is only stored locally in `.sibyl/sessions`. An
  unreachable API does not fail the build unless `--require-upload` is passed.
- No Redis, Postgres or Docker service is needed.

## Prerequisite: installing the CLI

`@sibyl/cli` is **not published to npm**, so `npx @sibyl/cli` does not work. The job must check out
and install a project whose dependencies include `@sibyl/cli` and `@sibyl/core` (the config imports
`@sibyl/core`, so it must resolve from the config's directory) — for example this monorepo, or a
project that references the packages from a git checkout. The wrappers default to
`npx --no sibyl`, which runs the locally installed binary and never downloads anything; override
the `cli` parameter to point somewhere else (e.g. `node path/to/sibyl/packages/cli/bin/sibyl.js`).

Node.js 22 is recommended.

## GitHub Actions

`github-action/action.yml` is a composite action:

```yaml
jobs:
  sibyl:
    runs-on: ubuntu-latest
    env:
      SIBYL_API_URL: ${{ secrets.SIBYL_API_URL }}
      SIBYL_API_TOKEN: ${{ secrets.SIBYL_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: <owner>/sibyl/packages/integrations/github-action@main
        with:
          config: sibyl.config.ts
          iterations: 200
      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Sibyl
          path: reports/sibyl-junit.xml
          reporter: java-junit
```

## GitLab CI

`gitlab/sibyl.gitlab-ci.yml` is a CI component with inputs `config`, `iterations`, `seed`, `junit`,
`require_upload`, `allow_intermittent`, `install`, `cli`, `image`:

```yaml
include:
  - project: <group>/sibyl
    file: packages/integrations/gitlab/sibyl.gitlab-ci.yml
    inputs:
      config: sibyl.config.ts
      iterations: "200"
```

Define `SIBYL_API_URL` and a masked `SIBYL_API_TOKEN` under Settings > CI/CD > Variables.

## Jenkins

`jenkins/vars/sibyl.groovy` is a shared-library step (needs the Credentials Binding and JUnit plugins):

```groovy
@Library('sibyl') _
pipeline {
  agent any
  stages {
    stage('Sibyl') {
      steps {
        sh 'corepack enable && pnpm install --frozen-lockfile'
        sibyl(config: 'sibyl.config.ts', iterations: 200,
              apiUrl: 'https://sibyl.example.com', apiTokenCredentialsId: 'sibyl-api-token')
      }
    }
  }
}
```

## CircleCI

`circleci/orb.yml` provides a `ci` command and a `test` job:

```yaml
version: 2.1
orbs:
  sibyl: <namespace>/sibyl@x.y.z
workflows:
  reliability:
    jobs:
      - sibyl/test:
          config: sibyl.config.ts
          iterations: "200"
          context: sibyl   # provides SIBYL_API_URL / SIBYL_API_TOKEN
```

## Directory structure

```
integrations/
├── github-action/  # composite GitHub Action
├── circleci/       # CircleCI orb
├── gitlab/         # GitLab CI component
└── jenkins/        # Jenkins shared-library step
```
