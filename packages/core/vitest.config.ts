import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'examples/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/api/**',
        'src/audit/**',
        'src/auth/**',
        'src/billing/**',
        'src/db/**',
        'src/queue/**',
        'src/sandbox/**',
        'src/telemetry/**',
        'src/calendar.ts',
        'src/github-app.ts',
        'src/index.ts',
        'src/driver.ts'
      ],
      thresholds: {
        lines: 85
      }
    }
  }
});
