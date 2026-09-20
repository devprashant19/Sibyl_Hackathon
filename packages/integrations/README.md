# @sibyl/integrations

CI/CD pipeline wrappers for running Sibyl simulations in continuous integration environments.

## Overview

This package provides pre-built configuration templates and wrapper scripts for popular CI/CD platforms. Each integration runs `sibyl ci` with platform-appropriate output formatting (JUnit XML, SARIF, etc.) and exits with a non-zero code on promise violations.

## Supported Platforms

### GitHub Actions

```yaml
# .github/workflows/sibyl.yml
name: Sibyl Chaos Tests
on: [push, pull_request]

jobs:
  sibyl:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx sibyl ci ./src \
          --promise no-lost-updates \
          --budget 200 \
          --strategy mcts \
          --junit-output results.xml
      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Sibyl Results
          path: results.xml
          reporter: java-junit
```

### GitLab CI

```yaml
# .gitlab-ci.yml
sibyl:
  image: node:20
  services:
    - redis:7
  script:
    - npm ci
    - npx sibyl ci ./src --budget 200 --junit-output results.xml
  artifacts:
    reports:
      junit: results.xml
```

### Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any
    stages {
        stage('Sibyl Chaos Test') {
            steps {
                sh 'npx sibyl ci ./src --budget 200 --junit-output results.xml'
            }
            post {
                always {
                    junit 'results.xml'
                }
            }
        }
    }
}
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1
jobs:
  sibyl:
    docker:
      - image: cimg/node:20.0
      - image: redis:7
    steps:
      - checkout
      - run: npm ci
      - run: npx sibyl ci ./src --budget 200 --junit-output results.xml
      - store_test_results:
          path: results.xml
```

## GitHub App Integration

For richer GitHub integration (PR comments with run summaries, status checks, inline annotations), see the [GitHub App Setup Guide](../../GITHUB_APP_SETUP.md).

## Directory Structure

```
integrations/
├── circleci/     # CircleCI orb configuration
├── gitlab/       # GitLab CI template
└── jenkins/      # Jenkins shared library
```
