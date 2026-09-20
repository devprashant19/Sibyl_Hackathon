import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { API_TOKEN, API_URL, FAILING_PROMISE, ITERATIONS, SEED } from './e2e-env';

const repoRoot = path.resolve(__dirname, '..', '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'bin', 'sibyl.js');
const quickstartConfig = path.join(repoRoot, 'packages', 'cli', 'examples', 'quickstart', 'sibyl.config.ts');

function runCli(args: string[], cwd: string, env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`sibyl ${args.join(' ')} timed out after 180s:\n${out}`));
    }, 180_000);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

/**
 * Seeds the API with a real session: runs `sibyl ci` on the CLI's quickstart config (a checkout that
 * double-charges when the payment call fails), uploading to the API that webServer started.
 * Anything unexpected throws, which aborts the test run with the CLI output.
 */
export default async function globalSetup() {
  // The config imports @sibyl/core, which must resolve from its directory, so the project lives
  // inside the workspace (as in scripts/smoke.mjs).
  const project = fs.mkdtempSync(path.join(repoRoot, 'packages', 'cli', 'examples', '.e2e-'));
  const cleanup = () => fs.rmSync(project, { recursive: true, force: true });

  try {
    fs.copyFileSync(quickstartConfig, path.join(project, 'sibyl.config.ts'));

    const { code, out } = await runCli(
      ['ci', '-n', String(ITERATIONS), '--seed', SEED, '--require-upload'],
      project,
      { SIBYL_API_URL: API_URL, SIBYL_API_TOKEN: API_TOKEN },
    );
    if (code !== 1 || !/Uploaded to/.test(out)) {
      throw new Error(`Expected \`sibyl ci\` to find failures (exit 1) and upload them; exit ${code}:\n${out}`);
    }

    const res = await fetch(`${API_URL}/api/v1/runs?status=FAILED&limit=1000`);
    const body = (await res.json()) as { data: { runId: string; failedPromises: string[] }[] };
    if (!res.ok || body.data.length === 0 || !body.data.every(r => r.failedPromises.includes(FAILING_PROMISE))) {
      throw new Error(`The API does not list the uploaded failed runs (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 500)}`);
    }
  } finally {
    cleanup();
  }
}
