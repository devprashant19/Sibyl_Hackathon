# Sibyl GitHub Actions Integration

Integrating Sibyl into your Continuous Integration (CI) pipeline ensures that no pull request merges unless your system is resilient to failure. The `sibyl ci` command is specifically designed for CI environments: it suppresses live-updating UI elements in favor of clean logs, and strictly exits with a non-zero code (`process.exit(1)`) if any invariant promises fail.

## Example Workflow

Create a new file in your repository at `.github/workflows/sibyl.yml`:

```yaml
name: "Sibyl Resiliency Checks"

on:
  pull_request:
    branches: [ "main" ]

jobs:
  simulate:
    name: Run Chaos Simulation
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci
        
      # (Optional) Spin up your staging/test dependencies (e.g. Postgres, Kafka)
      # - name: Start Test Infrastructure
      #   run: docker-compose -f docker-compose.test.yml up -d

      - name: Run Sibyl CI
        run: npx sibyl ci --target=sibyl.config.ts --iterations=200 --concurrency=4
```

## How It Works
1. **Target**: The `--target` flag points to your configuration file containing your `workflow()` execution logic, your `templates`, and your `promises`.
2. **Iterations**: The `--iterations` flag dictates how many permutations to search. A higher number takes longer but explores a wider surface area of failure combinations.
3. **Exit Codes**: If the Search Orchestrator discovers a failure path (e.g., HTTP Timeout + DB Deadlock causes a 500), `sibyl ci` will log the exact exact chronological event sequence and exit `1`. The PR will be blocked.
4. **Replay**: Your developers can copy the `run-id` printed in the failed GitHub Action log and run `npx sibyl replay <run-id>` locally to reproduce the exact failure locally for debugging!
