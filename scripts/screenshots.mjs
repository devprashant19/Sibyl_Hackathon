#!/usr/bin/env node
// Regenerates docs/screenshots/*.png by driving the real dashboard in headless Chromium against the real
// API, after seeding it with real sessions from the two CLI examples. Nothing in the images is mocked.
//
//   pnpm screenshots            (needs Playwright's Chromium: pnpm --filter @sibyl/e2e exec playwright install chromium)
//
// Uses ports 4100 and 3100 so it can run alongside a dev stack.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const { chromium } = createRequire(`${root}/packages/e2e/package.json`)('@playwright/test');

const out = process.argv[2] ?? `${root}/docs/screenshots`;
fs.mkdirSync(out, { recursive: true });
const procs = [];
const log = (...a) => console.log('[shots]', ...a);

function start(cmd, args, opts, readyRe, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: process.platform === 'win32' && cmd !== process.execPath, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.push(child);
    let buf = '';
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${readyRe}:\n${buf.slice(-2000)}`)), timeoutMs);
    const on = d => { buf += d; if (readyRe.test(buf)) { clearTimeout(t); resolve(buf); } };
    child.stdout.on('data', on);
    child.stderr.on('data', on);
  });
}

const run = (args, opts) => new Promise(resolve => {
  const c = spawn(process.execPath, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  let o = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => o += d);
  c.on('close', code => resolve({ code, o }));
});

try {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-shots-'));
  await start(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: `${root}/packages/api`, env: { ...process.env, PORT: '4100', SIBYL_DATA_DIR: data },
  }, /Sibyl API/, 60_000);
  log('api up');

  for (const example of ['quickstart', 'inventory-race']) {
    const r = await run([`${root}/packages/cli/bin/sibyl.js`, 'run', '-c', `${root}/packages/cli/examples/${example}/sibyl.config.ts`, '-n', '30', '--seed', 'shots'], {
      cwd: root, env: { ...process.env, SIBYL_API_URL: 'http://127.0.0.1:4100', FORCE_COLOR: '0' },
    });
    log(example, r.o.match(/Result.*|Uploaded.*|Upload failed.*/g));
  }

  await start('npx', ['next', 'dev', '-p', '3100'], {
    cwd: `${root}/packages/dashboard`, env: { ...process.env, NEXT_PUBLIC_SIBYL_API_URL: 'http://127.0.0.1:4100' },
  }, /Ready in|ready started|Local:/, 180_000);
  log('dashboard up');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

  await page.goto('http://localhost:3100/runs', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/runs.png`, fullPage: false });
  const bodyText = await page.locator('body').innerText();
  log('runs page mentions FAILED:', /FAILED/i.test(bodyText), '| promise id:', /charge-at-most-once|no-lost-sales/.test(bodyText));

  // Open a failed run: click the first element mentioning FAILED that looks clickable.
  const candidate = page.locator('a, button, tr, li, [role=button]').filter({ hasText: /FAILED/ }).first();
  if (await candidate.count()) {
    await candidate.click();
    await page.waitForTimeout(4000);
    // The list already shows the first run's header; scroll the detail pane to its schedule and timeline.
    await page.mouse.move(1000, 600);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${out}/run-detail.png`, fullPage: false });
    const t = await page.locator('body').innerText();
    log('detail shows replay command:', /sibyl replay/.test(t), '| failed promise:', /charge-at-most-once|no-lost-sales/.test(t));
  } else {
    log('no clickable FAILED element found');
  }

  await page.goto('http://localhost:3100/trends', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/trends.png`, fullPage: false });
  log('trends mentions promise:', /charge-at-most-once|no-lost-sales/.test(await page.locator('body').innerText()));

  log('console errors:', errors.length ? errors.slice(0, 10) : 'none');
  await browser.close();
} catch (e) {
  console.error('[shots] FAILED:', e.message);
  process.exitCode = 1;
} finally {
  for (const p of procs) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']);
      } else {
        p.kill();
      }
    } catch {}
  }
  setTimeout(() => process.exit(), 1500);
}
