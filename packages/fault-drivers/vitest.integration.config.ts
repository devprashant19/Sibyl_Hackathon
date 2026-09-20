import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
});
