import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['**/src/**/*.ts'],
      exclude: ['**/src/**/*.test.ts', '**/__mocks__/**', '**/*.integration.test.ts'],
      thresholds: {
        lines: 85
      }
    }
  }
});
