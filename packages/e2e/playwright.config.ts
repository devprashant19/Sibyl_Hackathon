import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { API_PORT, API_TOKEN, API_URL, DASHBOARD_PORT, DASHBOARD_URL } from './e2e-env';

/**
 * End-to-end journey against the real stack, with no containers:
 *
 *   webServer[0]  the API (packages/api), in-memory store, on API_PORT (default 4000)
 *   webServer[1]  the dashboard (packages/dashboard) on DASHBOARD_PORT (default 3000), pointed at the API
 *   globalSetup   runs the real CLI (`sibyl ci`) against the quickstart config, uploading to the API
 *   tests/        drive the dashboard through the uploaded runs
 *
 * Playwright starts the web servers before globalSetup, so the servers get all their configuration
 * here (not from globalSetup), and globalSetup can talk to a running API.
 *
 * Locally the dashboard runs under `next dev`; on CI (CI=true) it is built and served with
 * `next start`. Existing servers on the ports are never reused: their data would not be ours.
 */

const repoRoot = path.resolve(__dirname, '..', '..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 120_000,
  expect: { timeout: 30_000 },

  globalSetup: './global-setup.ts',

  use: {
    baseURL: DASHBOARD_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      // Same as `pnpm --filter @sibyl/api start`, without pnpm in between (clean shutdown on all OSes).
      command: 'node --import tsx/esm src/server.ts',
      cwd: path.join(repoRoot, 'packages', 'api'),
      url: `${API_URL}/api/health`,
      env: {
        PORT: String(API_PORT),
        SIBYL_API_HOST: '127.0.0.1',
        SIBYL_DATA_DIR: ':memory:',
        SIBYL_API_TOKEN: API_TOKEN,
      },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: process.env.CI
        ? `pnpm exec next build && pnpm exec next start --port ${DASHBOARD_PORT}`
        : `pnpm exec next dev --port ${DASHBOARD_PORT}`,
      cwd: path.join(repoRoot, 'packages', 'dashboard'),
      url: DASHBOARD_URL,
      env: {
        // Inlined into the browser bundle; the browser fetches the API directly.
        NEXT_PUBLIC_SIBYL_API_URL: API_URL,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
