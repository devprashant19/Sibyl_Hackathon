import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

test.describe('Sibyl User Journey', () => {

  test('Full E2E Journey', async ({ page }) => {
    // 1. Sign Up & Login
    await page.goto('/');
    
    // We expect the dashboard to redirect to a sign-up or login page, or provide a button.
    // We'll click it. (If it's already on the dashboard because auth is stubbed, this might fail,
    // but we write the test assuming the real flow.)
    const signUpBtn = page.getByRole('button', { name: /Sign Up|Get Started/i });
    if (await signUpBtn.isVisible()) {
      await signUpBtn.click();
      await page.getByLabel(/Email/i).fill('test@sibyl.dev');
      await page.getByLabel(/Password/i).fill('Password123!');
      await page.getByRole('button', { name: /Submit|Create Account/i }).click();
    }
    
    // Ensure we are logged in and on the dashboard
    await expect(page.getByRole('heading', { name: /Dashboard|Projects/i })).toBeVisible();

    // 2. Create a project
    await page.getByRole('button', { name: /New Project|Create Project/i }).click();
    await page.getByLabel(/Project Name/i).fill('E2E Test Project');
    await page.getByRole('button', { name: /Create/i }).click();

    // Verify project created
    await expect(page.getByText('E2E Test Project')).toBeVisible();

    // 3 & 4. Install the SDK example and run `sibyl run` from the CLI
    // We simulate this by executing the CLI against the bug-suite example
    console.log('Running sibyl CLI...');
    
    const cliPath = path.resolve(__dirname, '../../cli/bin/sibyl');
    const targetScript = path.resolve(__dirname, '../../core/examples/bug-suite/race-condition.ts');
    
    try {
      execSync(`node ${cliPath} run --target ${targetScript} --iterations 5`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          // Use the test database and redis
          DATABASE_URL: process.env.DATABASE_URL,
          REDIS_URL: process.env.REDIS_URL,
        }
      });
    } catch (err) {
      // It's expected to fail if the CLI exits with non-zero on bugs, which it should!
      console.log('CLI execution finished (expected failure if bugs found).');
    }

    // 5. See the run appear in the dashboard in real time
    await page.goto('/runs');
    // We expect at least one run to be listed
    const runItem = page.locator('text=bug-suite/race-condition.ts').first();
    // Or maybe just a generic run ID link
    // Let's look for a generic "Failed" badge or link to the run
    const failedRunLink = page.getByRole('link').filter({ hasText: /Failed|Errored/i }).first();
    await expect(failedRunLink).toBeVisible({ timeout: 15000 });

    // 6. Click into a failing run
    await failedRunLink.click();

    // 7. See the grounded root-cause explanation (Prompt 10.2)
    // The UI should display the AI Root Cause Analysis
    const rcaSection = page.getByRole('heading', { name: /Root Cause Analysis|AI Explanation/i });
    await expect(rcaSection).toBeVisible();
    
    const rcaContent = page.locator('.rca-content'); // Assume some class
    await expect(rcaContent).toContainText(/race condition/i);

    // 8. Assign it to a teammate (Prompt 9.3)
    const assignBtn = page.getByRole('button', { name: /Assign/i });
    await assignBtn.click();
    
    const teammateInput = page.getByLabel(/Teammate/i);
    await teammateInput.fill('alice@sibyl.dev');
    await page.getByRole('button', { name: /Save|Confirm/i }).click();
    
    await expect(page.getByText('Assigned to alice@sibyl.dev')).toBeVisible();
  });
});
