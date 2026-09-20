#!/usr/bin/env node
// End-to-end smoke test. Starts the real API, runs the real CLI against a real workflow with real
// fault injection, and checks every hop: search → local session → upload → API → SSE → replay.
// Prints what it checked; exits non-zero on the first thing that is wrong.
//
//   pnpm smoke
//
// Needs nothing running and nothing installed beyond `pnpm install`. Cleans up after itself.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliBin = path.join(root, 'packages', 'cli', 'bin', 'sibyl.js');
const apiDir = path.join(root, 'packages', 'api');
const TOKEN = 'smoke-token';

let passed = 0;
const cleanups = [];

function ok(message) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${message}`);
}

function fail(message, detail) {
  console.log(`  \x1b[31m✗ ${message}\x1b[0m`);
  if (detail) console.log(String(detail).split('\n').map(l => `    ${l}`).join('\n'));
  throw new Error(message);
}

function check(condition, message, detail) {
  if (condition) ok(message);
  else fail(message, detail);
}

function run(args, { cwd, env = {}, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

async function startApi(dataDir) {
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: apiDir,
    env: { ...process.env, PORT: '0', SIBYL_DATA_DIR: dataDir, SIBYL_API_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  cleanups.push(() => child.kill());
  let log = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not start within 60s:\n${log}`)), 60_000);
    const onData = d => {
      log += d;
      const m = log.match(/on (http:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => reject(new Error(`API exited with ${code}:\n${log}`)));
  });
  return { url, child };
}

async function json(url, init) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.json() };
}

/** Collects SSE `data:` frames from a stream until stopped. */
function listen(url) {
  const controller = new AbortController();
  const events = [];
  const done = (async () => {
    try {
      const res = await fetch(url, { signal: controller.signal });
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const data = frame.split('\n').find(l => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      }
    } catch {
      // aborted
    }
  })();
  return { events, stop: async () => { controller.abort(); await done; } };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-smoke-'));
  // The workspace must resolve @sibyl/core from the config, so the project lives inside the repo.
  const project = fs.mkdtempSync(path.join(root, 'packages', 'cli', 'examples', '.smoke-'));
  cleanups.push(() => fs.rmSync(project, { recursive: true, force: true }));
  cleanups.push(() => fs.rmSync(tmp, { recursive: true, force: true }));

  console.log('\nAPI');
  const api = await startApi(path.join(tmp, 'sessions'));
  const health = await json(`${api.url}/api/health`);
  check(health.status === 200 && health.body.status === 'ok', `health ok at ${api.url}`, JSON.stringify(health));
  check(health.body.auth.writesRequireToken === true, 'writes require a token when SIBYL_API_TOKEN is set');
  const anon = await fetch(`${api.url}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(anon.status === 401, 'an upload without the token is refused (401)');
  const bad = await fetch(`${api.url}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: '{"project":' });
  check(bad.status === 400, 'malformed JSON is a 400, not a 500');

  console.log('\nCLI');
  const init = await run(['init'], { cwd: project });
  check(init.code === 0 && fs.existsSync(path.join(project, 'sibyl.config.ts')), 'sibyl init writes a config', init.out);

  const doctor = await run(['doctor'], { cwd: project, env: { SIBYL_API_URL: api.url, SIBYL_API_TOKEN: TOKEN } });
  check(doctor.code === 0 && /PASS\] Config/.test(doctor.out) && /PASS\] API/.test(doctor.out), 'sibyl doctor passes config and API checks', doctor.out);

  const stream = listen(`${api.url}/api/v1/events`);
  await new Promise(r => setTimeout(r, 200));

  const env = { SIBYL_API_URL: api.url, SIBYL_API_TOKEN: TOKEN };
  const ci = await run(['ci', '-n', '40', '--seed', 'smoke', '--junit', 'reports/junit.xml'], { cwd: project, env });
  check(ci.code === 1, 'sibyl ci exits 1 when a promise fails', ci.out);
  const summary = ci.out.match(/Result\s+(\d+) runs · (\d+) failed/);
  check(summary && Number(summary[1]) === 40 && Number(summary[2]) > 0, `the search ran 40 runs and found failures (${summary?.[2]} failed)`, ci.out);
  check(/Uploaded to/.test(ci.out), 'the session was uploaded', ci.out);

  const junit = fs.readFileSync(path.join(project, 'reports', 'junit.xml'), 'utf-8');
  check(/<testsuites[^>]*tests="40"/.test(junit) && /<failure/.test(junit), 'a JUnit report with 40 testcases and failures was written');

  const sessionFiles = fs.readdirSync(path.join(project, '.sibyl', 'sessions'));
  check(sessionFiles.length === 1, 'the session was saved locally');
  const local = JSON.parse(fs.readFileSync(path.join(project, '.sibyl', 'sessions', sessionFiles[0]), 'utf-8'));

  const again = await run(['run', '-n', '40', '--seed', 'smoke', '--no-upload'], { cwd: project });
  const summary2 = again.out.match(/Result\s+(\d+) runs · (\d+) failed/);
  check(summary2 && summary2[2] === summary[2], `the same seed finds the same number of failures in a fresh process (${summary2?.[2]})`, again.out);

  console.log('\nAPI after upload');
  const runs = await json(`${api.url}/api/v1/runs?status=FAILED&limit=1000`);
  check(runs.status === 200 && runs.body.data.length === Number(summary[2]), `GET /runs?status=FAILED returns all ${summary[2]} failed runs`, JSON.stringify(runs.body).slice(0, 400));
  const failed = runs.body.data[0];
  check(failed.sessionId === local.id && failed.failedPromises.includes('charge-at-most-once'), 'runs are linked to the session and name the broken promise');

  const detail = await json(`${api.url}/api/v1/runs/${failed.runId}`);
  check(detail.status === 200 && detail.body.data.events.length > 0, `run detail carries the event timeline (${detail.body.data.events?.length} events)`);
  check(detail.body.data.events.every(e => e.fault), 'every captured fault event names the fault it injected');

  const trends = await json(`${api.url}/api/v1/promises/trends`);
  check(trends.body.data[0]?.promiseId === 'charge-at-most-once' && trends.body.data[0].points.length === 1, 'promise trends include the session');

  await new Promise(r => setTimeout(r, 300));
  await stream.stop();
  check(stream.events.some(e => e.type === 'progress'), `live progress reached an SSE subscriber (${stream.events.filter(e => e.type === 'progress').length} progress events)`);
  check(stream.events.some(e => e.type === 'completed' && e.sessionId === local.id), 'a completed event arrived for the session');

  console.log('\nReplay');
  const byPrefix = await run(['replay', failed.runId.slice(0, 8)], { cwd: project });
  check(byPrefix.code === 0 && /Reproduced: same outcome and same fault decisions/.test(byPrefix.out), 'a failing run replays to the same outcome and fault decisions (by id prefix)', byPrefix.out);

  // Replay through the API only: hide the local sessions.
  fs.renameSync(path.join(project, '.sibyl'), path.join(project, '.sibyl-hidden'));
  const remote = await run(['replay', failed.runId], { cwd: project, env });
  check(remote.code === 0 && /Reproduced/.test(remote.out), 'the same run replays from the API when it is not stored locally', remote.out);
  fs.renameSync(path.join(project, '.sibyl-hidden'), path.join(project, '.sibyl'));

  const missing = await run(['replay', '00000000-0000-4000-8000-000000000000'], { cwd: project });
  check(missing.code === 1 && /No run/.test(missing.out), 'replaying an unknown run fails with a clear message', missing.out);

  console.log(`\n\x1b[32m${passed} checks passed\x1b[0m`);
}

main()
  .catch(err => {
    console.error(`\n\x1b[31mSmoke test failed after ${passed} checks: ${err.message}\x1b[0m`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const fn of cleanups.reverse()) {
      try { await fn(); } catch { /* best effort */ }
    }
  });
