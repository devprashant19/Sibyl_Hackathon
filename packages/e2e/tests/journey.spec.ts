import { test, expect } from '@playwright/test';
import { API_URL, FAILING_PROMISE, ITERATIONS } from '../e2e-env';

interface RunListItem {
  runId: string;
  status: string;
  failedPromises: string[];
}

test.describe('Sibyl user journey', () => {
  test('failed runs uploaded by the CLI can be explored in the dashboard', async ({ page, request }) => {
    // Ground truth from the API that globalSetup seeded.
    const res = await request.get(`${API_URL}/api/v1/runs`, { params: { status: 'FAILED', limit: 1000 } });
    expect(res.ok()).toBeTruthy();
    const failedRuns = ((await res.json()) as { data: RunListItem[] }).data;
    expect(failedRuns.length).toBeGreaterThan(0);
    expect(failedRuns.length).toBeLessThanOrEqual(ITERATIONS);

    // 1. Run Explorer lists the failed runs.
    await page.goto('/runs');
    await expect(page.getByRole('heading', { name: 'Simulation Runs' })).toBeVisible();
    await page.getByLabel('Filter by status').selectOption('FAILED');

    const list = page.getByRole('list', { name: 'Simulation runs' });
    const items = list.getByRole('button');
    await expect(items).toHaveCount(failedRuns.length);
    await expect(items.first()).toContainText('FAILED');
    await expect(items.first()).toContainText(FAILING_PROMISE);

    // 2. Open a failed run that is not the one selected by default.
    const target = failedRuns[failedRuns.length - 1];
    await page.getByTestId(`run-item-${target.runId}`).click();
    await expect(page.getByTestId(`run-item-${target.runId}`)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('heading', { name: `Run ${target.runId}` })).toBeVisible();

    // 3. The broken promise and the replay command are shown.
    const promise = page.getByTestId(`promise-${FAILING_PROMISE}`);
    await expect(promise).toContainText('FAIL');
    await expect(promise).toContainText('A checkout never charges the customer twice');
    await expect(page.getByTestId('replay-command')).toHaveText(`sibyl replay ${target.runId}`);

    // 4. Promise Trends shows the session's fail rate for the promise.
    await page.getByRole('link', { name: 'Promise Trends' }).click();
    await expect(page).toHaveURL(/\/trends$/);
    await expect(page.getByRole('heading', { name: 'Promise Trends' })).toBeVisible();
    await expect(page.getByTestId(`trend-card-${FAILING_PROMISE}`)).toContainText(
      `${failedRuns.length}/${ITERATIONS} runs failed across 1 session`,
    );
  });
});
