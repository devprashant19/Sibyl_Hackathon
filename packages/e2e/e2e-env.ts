/** Ports and URLs shared by playwright.config.ts, global-setup.ts and the specs. */

export const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);
export const DASHBOARD_PORT = Number(process.env.E2E_DASHBOARD_PORT ?? 3000);

// 127.0.0.1 for the API (it binds there); localhost for the dashboard, which `next dev` treats as
// same-origin for its dev assets.
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

export const API_TOKEN = 'e2e-token';

/** The session globalSetup uploads. */
export const SEED = 'e2e';
export const ITERATIONS = 40;
export const FAILING_PROMISE = 'charge-at-most-once';
