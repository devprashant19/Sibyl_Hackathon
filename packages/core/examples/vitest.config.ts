import { defineConfig } from 'vitest/config';

// The example tests (bug-suite/runner.test.ts, e2e-race.test.ts, search-benchmark.test.ts) are
// excluded from core's own vitest.config.ts. Run them with:
//
//   cd packages/core && npx vitest run --dir examples --config examples/vitest.config.ts
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
  },
});
