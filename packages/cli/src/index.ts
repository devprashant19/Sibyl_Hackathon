import { Command, Option } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
import { execFileSync } from 'child_process';
import type { RunRecordPayload, Session } from '@sibyl/shared';
import { handleError, ConfigLoadError, ApiKeyError, NetworkError } from './errors';
import { loadConfig } from './config';
import { runSession, replayRun, RunOptions, STRATEGIES } from './session';
import { LocalSessionStore } from './storage';
import { ApiClient } from './api-client';
import { toJUnit } from './junit';
import { CONFIG_TEMPLATE } from './template';

export const VERSION = '0.1.0';

const DEFAULT_CONFIG = 'sibyl.config.ts';

/** Where local sessions live: next to the config file. */
const storeFor = (configPath: string) => new LocalSessionStore(path.dirname(path.resolve(configPath)));

function apiFromEnv(): ApiClient | undefined {
  const url = process.env.SIBYL_API_URL;
  return url ? new ApiClient(url, process.env.SIBYL_API_TOKEN) : undefined;
}

function parsePositiveInt(name: string) {
  return (value: string) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer, got "${value}"`);
    return n;
  };
}

/** AI-agent errors that mean "not available right now" rather than "Sibyl is broken". */
function isAgentUnavailable(err: any): boolean {
  return ['BudgetExceededError', 'ClaudeUnavailableError', 'AIDisabledError', 'BudgetStoreCorruptError', 'ClaudeResponseError', 'AgentTurnLimitError']
    .includes(err?.name);
}

function statusColor(status: string) {
  switch (status) {
    case 'COMPLETED': return chalk.green(status);
    case 'FAILED': return chalk.red(status);
    case 'INTERMITTENT': return chalk.yellow(status);
    default: return chalk.magenta(status);
  }
}

function describeSchedule(run: Pick<RunRecordPayload, 'concreteSchedules'>): string {
  if (run.concreteSchedules.length === 0) return 'no faults';
  return run.concreteSchedules.map(s => {
    const spec: any = s.spec;
    const extra = spec.delayMs !== undefined ? ` ${spec.delayMs}ms` : spec.offsetMs !== undefined ? ` ${spec.offsetMs}ms` : '';
    return `${spec.domain}/${spec.type}${extra} @p=${Number(s.probability.toFixed(3))}`;
  }).join(', ');
}

function printSummary(session: Session, file: string) {
  const s = session.summary;
  const line = [
    `${s.totalRuns} runs`,
    s.failures ? chalk.red(`${s.failures} failed`) : chalk.green('0 failed'),
    s.intermittent ? chalk.yellow(`${s.intermittent} intermittent`) : null,
    s.errored ? chalk.magenta(`${s.errored} errored`) : null,
    `${((session.completedAt - session.startedAt) / 1000).toFixed(1)}s`,
  ].filter(Boolean).join(chalk.gray(' · '));
  console.log(`\n${chalk.bold('Result')}  ${line}`);
  console.log(chalk.gray(`Seed ${session.seed} · strategy ${session.strategy} · saved ${path.relative(process.cwd(), file) || file}`));

  if (s.totalRuns < session.iterations) {
    console.log(chalk.gray(`Stopped after ${s.totalRuns} of ${session.iterations} runs: --early-exit hit a failure, or the strategy kept proposing schedules it had already tried.`));
  }

  const notPassing = session.runs.filter(r => !r.passed);
  if (notPassing.length === 0) return;

  // Deterministic failures first (an intermittent run may not reproduce on replay), then the
  // smallest schedules, which are the easiest to reason about.
  const rank: Record<string, number> = { FAILED: 0, ERRORED: 1, INTERMITTENT: 2 };
  const shown = [...notPassing]
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || a.concreteSchedules.length - b.concreteSchedules.length)
    .slice(0, 5);
  console.log(`\n${chalk.bold('Runs that did not pass')}${notPassing.length > shown.length ? chalk.gray(` (showing ${shown.length} of ${notPassing.length})`) : ''}`);
  for (const run of shown) {
    console.log(`  ${statusColor(run.status)} ${chalk.white(run.runId.slice(0, 8))}  ${chalk.gray(describeSchedule(run))}`);
    for (const p of run.promiseResults.filter(p => !p.passed)) {
      console.log(`    ${chalk.red('✗')} ${p.promiseId}${p.message ? chalk.gray(` — ${p.message}`) : ''}`);
    }
    if (run.error) console.log(`    ${chalk.magenta('!')} ${run.error}`);
  }
  console.log(chalk.cyan(`\nReproduce: sibyl replay ${shown[0].runId.slice(0, 8)}`));
}

async function executeSession(options: any, source: 'cli' | 'ci') {
  const loaded = await loadConfig(options.config);
  const api = options.upload === false ? undefined : apiFromEnv();
  const interactive = source === 'cli' && process.stdout.isTTY;
  const total = options.iterations ?? loaded.config.iterations ?? 100;

  console.log(chalk.bold(`\nSibyl ${VERSION}`) + chalk.gray(` · ${loaded.project} · ${path.relative(process.cwd(), loaded.path) || loaded.path}`));

  const bar = interactive
    ? new cliProgress.SingleBar({
        format: `${chalk.cyan('{bar}')} {value}/{total} runs | {failures} failed`,
        barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
      })
    : undefined;
  bar?.start(total, 0, { failures: 0 });
  let lastLogged = 0;

  const runOptions: RunOptions = {
    iterations: options.iterations,
    concurrency: options.concurrency,
    seed: options.seed,
    strategy: options.strategy,
    clock: options.clock,
    earlyExit: options.earlyExit,
    runTimeoutMs: options.timeout,
    updateSnapshots: options.updateSnapshots,
    source,
    onRun: (_run, progress, sessionId) => {
      bar?.update(progress.done, { failures: progress.failures });
      if (!bar && (progress.done - lastLogged >= Math.max(1, Math.floor(total / 10)) || progress.done === total)) {
        lastLogged = progress.done;
        console.log(`[sibyl] ${progress.done}/${total} runs, ${progress.failures} failed`);
      }
      api?.reportProgress({ type: 'progress', sessionId, project: loaded.project, ...progress, lastRun: { runId: _run.runId, status: _run.status } });
    },
  };

  let session: Session;
  try {
    ({ session } = await runSession(loaded, runOptions));
  } finally {
    bar?.stop();
    api?.flushProgress();
  }

  const file = storeFor(options.config).save(session);
  printSummary(session, file);

  if (options.junit) {
    fs.mkdirSync(path.dirname(path.resolve(options.junit)), { recursive: true });
    fs.writeFileSync(options.junit, toJUnit(session));
    console.log(chalk.gray(`JUnit report written to ${options.junit}`));
  }

  if (api) {
    try {
      await api.createSession(session);
      console.log(chalk.gray(`Uploaded to ${process.env.SIBYL_API_URL} (session ${session.id})`));
    } catch (err: any) {
      // The session is safe on disk; an unreachable API is worth saying, not worth failing over.
      console.log(chalk.yellow(`Upload failed: ${err.message}`));
      if (options.requireUpload) throw new NetworkError(`Upload required but failed: ${err.message}`);
    }
  }
  return session;
}

function findStoredRun(runId: string, configPath: string) {
  const local = storeFor(configPath).findRun(runId);
  if (local) return { run: local.run, session: local.session, source: 'local' as const };
  return undefined;
}

async function resolveRun(runId: string, configPath: string): Promise<{ run: RunRecordPayload; project: string; promises: Session['promises'] }> {
  const local = findStoredRun(runId, configPath);
  if (local) return { run: local.run, project: local.session.project, promises: local.session.promises };
  const api = apiFromEnv();
  const remote = api ? await api.getRun(runId) : undefined;
  if (remote) return { run: remote, project: remote.project, promises: remote.promises };
  const where = api ? `in ${storeFor(configPath).dir} or at ${process.env.SIBYL_API_URL}` : `in ${storeFor(configPath).dir} (set SIBYL_API_URL to also search the API)`;
  throw new Error(`No run ${runId} found ${where}.`);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('sibyl')
    .description('Deterministic fault-injection search for the bugs that only happen when things go wrong')
    .version(VERSION);

  // --- INIT ---
  program
    .command('init')
    .description('Create a sibyl.config.ts you can run straight away')
    .option('--force', 'Overwrite an existing config')
    .action(async (options) => {
      try {
        const target = path.join(process.cwd(), DEFAULT_CONFIG);
        if (fs.existsSync(target) && !options.force) {
          throw new ConfigLoadError(`${DEFAULT_CONFIG} already exists. Use --force to overwrite it.`, target);
        }
        fs.writeFileSync(target, CONFIG_TEMPLATE);
        console.log(chalk.green(`✔ Created ${DEFAULT_CONFIG}`));
        console.log(chalk.gray('  Replace the example workflow with a call into your own code, then run `sibyl run`.'));
      } catch (err) {
        handleError(err);
      }
    });

  const addRunOptions = (cmd: Command) => cmd
    .option('-c, --config <file>', 'Path to the Sibyl config', DEFAULT_CONFIG)
    .option('-n, --iterations <number>', 'Number of runs (default: config, else 100)', parsePositiveInt('iterations'))
    .option('--concurrency <number>', 'Runs executed in parallel', parsePositiveInt('concurrency'))
    .option('-s, --seed <seed>', 'Master seed; the same seed and config reproduce the session')
    .addOption(new Option('--strategy <name>', 'Search strategy').choices(STRATEGIES))
    .addOption(new Option('--clock <mode>', 'realtime, or accelerated to make timers fire instantly').choices(['realtime', 'accelerated']))
    .option('--timeout <ms>', 'Per-run timeout in milliseconds', parsePositiveInt('timeout'))
    .option('--early-exit', 'Stop at the first failing run')
    .option('--junit <file>', 'Write a JUnit XML report')
    .option('--no-upload', 'Do not upload to SIBYL_API_URL even if it is set')
    .option('-u, --update-snapshots', 'Update stored snapshot golden files');

  // --- RUN ---
  addRunOptions(program.command('run'))
    .description('Search for fault schedules that break your promises')
    .action(async (options) => {
      try {
        await executeSession(options, 'cli');
      } catch (err) {
        handleError(err);
      }
    });

  // --- CI ---
  addRunOptions(program.command('ci'))
    .description('Like run, without interactive output; exits 1 if any run failed or errored')
    .option('--require-upload', 'Fail if the upload to SIBYL_API_URL fails')
    .option('--allow-intermittent', 'Do not fail the build for intermittent (flaky) runs')
    .action(async (options) => {
      try {
        const session = await executeSession(options, 'ci');
        const s = session.summary;
        const bad = s.failures + s.errored + (options.allowIntermittent ? 0 : s.intermittent);
        if (bad > 0) {
          console.error(`[sibyl] ${bad} run(s) did not pass. Failing the build.`);
          process.exit(1);
        }
        console.log('[sibyl] All runs passed.');
      } catch (err) {
        handleError(err);
      }
    });

  // --- REPLAY ---
  program
    .command('replay <runId>')
    .description('Re-execute one run with its original seed and schedule, and check it reproduces')
    .option('-c, --config <file>', 'Path to the Sibyl config', DEFAULT_CONFIG)
    .option('--events', 'Print the replayed event timeline')
    .action(async (runId, options) => {
      try {
        const loaded = await loadConfig(options.config);
        const { run } = await resolveRun(runId, options.config);
        console.log(chalk.bold(`\nReplaying ${run.runId}`));
        console.log(chalk.gray(`Seed ${run.seed} · ${describeSchedule(run)} · originally ${run.status}`));

        const { replayed, statusMatches, timelineMatches } = await replayRun(loaded, run);

        console.log(`\nStatus    ${statusColor(replayed.status)}`);
        for (const p of replayed.promiseResults) {
          console.log(`  ${p.passed ? chalk.green('✓') : chalk.red('✗')} ${p.promiseId}${p.message ? chalk.gray(` — ${p.message}`) : ''}`);
        }
        if (options.events) {
          for (const e of replayed.events ?? []) {
            console.log(chalk.gray(`  ${new Date(e.timestamp).toISOString()} ${e.domain} ${JSON.stringify(e.payload)}`));
          }
        }

        // An intermittent run is expected to go either way on a single replay.
        const intermittent = run.status === 'INTERMITTENT' && (replayed.status === 'FAILED' || replayed.status === 'COMPLETED');
        if (statusMatches && timelineMatches !== false) {
          console.log(chalk.green(`\n✔ Reproduced: same outcome${timelineMatches ? ' and same fault decisions' : ''}.`));
        } else if (intermittent) {
          console.log(chalk.yellow(`\n~ The original run was intermittent; this replay ${replayed.status === 'FAILED' ? 'failed' : 'passed'}.`));
        } else {
          const what = statusMatches
            ? `same outcome (${run.status}), but the fault decisions differ`
            : `originally ${run.status}, now ${replayed.status}`;
          console.log(chalk.red(`\n✗ Did not reproduce: ${what}.`));
          console.log(chalk.gray('  The workflow depends on something outside the seed (wall-clock timing, external state, Math.random).'));
          process.exitCode = 1;
        }
      } catch (err) {
        handleError(err);
      }
    });

  // --- SESSIONS ---
  program
    .command('sessions')
    .description('List sessions saved next to the config')
    .option('-c, --config <file>', 'Path to the Sibyl config', DEFAULT_CONFIG)
    .option('-n, --limit <number>', 'How many to show', parsePositiveInt('limit'), 10)
    .action((options) => {
      try {
        const sessions = storeFor(options.config).list().slice(0, options.limit);
        if (sessions.length === 0) {
          console.log(chalk.gray('No sessions yet. Run `sibyl run`.'));
          return;
        }
        for (const s of sessions) {
          const fails = s.summary.failures + s.summary.errored + s.summary.intermittent;
          console.log(`${chalk.white(s.id.slice(0, 8))}  ${new Date(s.createdAt).toISOString()}  ${s.project}  ${s.summary.totalRuns} runs  ${fails ? chalk.red(`${fails} not passing`) : chalk.green('all passed')}  ${chalk.gray(`seed ${s.seed}`)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  // --- EXPLAIN ---
  program
    .command('explain <runId>')
    .description('Ask Claude for a root-cause explanation grounded in the run\'s captured events')
    .option('-c, --config <file>', 'Path to the Sibyl config (used to find local sessions)', DEFAULT_CONFIG)
    .option('--suggest-fix <files...>', 'Also draft a patch for these source files')
    .action(async (runId, options) => {
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new ApiKeyError('Missing ANTHROPIC_API_KEY environment variable.');
        const { run, promises } = await resolveRun(runId, options.config);
        if (run.passed) {
          console.log(chalk.yellow(`Run ${run.runId} passed; there is nothing to explain.`));
          return;
        }
        const { SibylExplainer, SibylPatcher } = await import('@sibyl/agent');
        const evidence = {
          status: run.status,
          error: run.error,
          schedules: run.concreteSchedules,
          failedPromises: run.promiseResults.filter(p => !p.passed).map(p => ({
            ...p, description: promises.find(d => d.id === p.promiseId)?.description,
          })),
        };

        let detailed;
        try {
          detailed = await new SibylExplainer({ apiKey }).explainFailureDetailed(run.runId, run.events ?? [], evidence);
        } catch (err: any) {
          if (!isAgentUnavailable(err)) throw err;
          console.log(chalk.yellow(`AI explanation unavailable: ${err.message}`));
          console.log(chalk.gray('Captured evidence:'));
          console.log(JSON.stringify({ evidence, events: run.events ?? [] }, null, 2));
          return;
        }

        console.log(chalk.bold('\nRoot-cause analysis'));
        console.log(detailed.validatedNarrative);
        if (!detailed.isGrounded) {
          console.log(chalk.yellow(`\nCaution: the explanation mentions things not present in the captured events: ${detailed.ungroundedReferences.join(', ')}`));
        }

        if (options.suggestFix?.length) {
          const files: Record<string, string> = {};
          for (const fp of options.suggestFix) {
            if (fs.existsSync(fp)) files[fp] = fs.readFileSync(fp, 'utf-8');
            else console.log(chalk.yellow(`Skipping ${fp}: not found`));
          }
          if (Object.keys(files).length > 0) {
            try {
              const patch = await new SibylPatcher({ apiKey }).suggestFix(detailed.validatedNarrative, files);
              const handoff = path.join(process.cwd(), 'sibyl-fix-handoff.md');
              fs.writeFileSync(handoff, `# Sibyl fix handoff\n\nRun: ${run.runId} (seed ${run.seed})\n\n**Explanation:** ${patch.explanation}\n\n\`\`\`diff\n${patch.unifiedDiff}\n\`\`\`\n`);
              console.log(chalk.green(`\n✔ Draft patch written to ${handoff}. Review it before applying; verify with \`sibyl replay ${run.runId.slice(0, 8)}\`.`));
            } catch (err: any) {
              if (!isAgentUnavailable(err)) throw err;
              console.log(chalk.yellow(`Patch generation unavailable: ${err.message}`));
            }
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  // --- INVESTIGATE ---
  program
    .command('investigate <bugDescription>')
    .description('Turn a plain-English bug report into a proposed fault schedule, using your config\'s promises')
    .option('-c, --config <file>', 'Path to the Sibyl config', DEFAULT_CONFIG)
    .action(async (bugDescription, options) => {
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new ApiKeyError('Missing ANTHROPIC_API_KEY environment variable.');
        const loaded = await loadConfig(options.config);
        const latest = storeFor(options.config).list()[0];
        const { SibylInvestigator } = await import('@sibyl/agent');

        const agent = new SibylInvestigator({
          apiKey,
          fetchPromises: async () => loaded.config.promises.map(p => ({ id: p.id, description: p.description, severity: p.severity })),
          fetchRecentEvents: async (_project: string, limit: number) =>
            (latest?.runs ?? []).flatMap(r => r.events ?? []).slice(-limit),
        });

        let result;
        try {
          result = await agent.investigate(bugDescription, loaded.project);
        } catch (err: any) {
          if (!isAgentUnavailable(err)) throw err;
          console.log(chalk.yellow(`Investigation unavailable: ${err.message}`));
          return;
        }

        if (result.status === 'NEEDS_CLARIFICATION') {
          console.log(chalk.yellow.bold('The investigator needs more detail:'));
          console.log(result.reasoning);
          console.log(chalk.cyan(`\nQuestion: ${result.clarifyingQuestion}`));
          return;
        }
        console.log(chalk.bold('\nReasoning'));
        console.log(result.reasoning);
        console.log(chalk.bold('\nProposed fault schedule template'));
        console.log(JSON.stringify(result.faultSchedule, null, 2));
        if (result.draftNewPromiseCode) {
          console.log(chalk.bold('\nDrafted promise'));
          console.log(result.draftNewPromiseCode);
        } else if (result.existingPromiseName) {
          console.log(chalk.gray(`\nChecks existing promise: ${result.existingPromiseName}`));
        }
        console.log(chalk.gray('\nAdd the template to `templates` in your config and run `sibyl run` to search around it.'));
      } catch (err) {
        handleError(err);
      }
    });

  // --- RETRO ---
  program
    .command('retro <postmortemFile>')
    .description('Draft promises and fault templates from an incident postmortem')
    .action(async (postmortemFile) => {
      try {
        if (!fs.existsSync(postmortemFile)) {
          throw new ConfigLoadError(`Could not find postmortem file: ${postmortemFile}`, postmortemFile);
        }
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new ApiKeyError('Missing ANTHROPIC_API_KEY environment variable.');
        const { SibylPostmortemAnalyzer } = await import('@sibyl/agent');

        let result;
        try {
          result = await new SibylPostmortemAnalyzer({ apiKey }).analyze(fs.readFileSync(postmortemFile, 'utf-8'));
        } catch (err: any) {
          if (!isAgentUnavailable(err)) throw err;
          console.log(chalk.yellow(`Analysis unavailable: ${err.message}`));
          return;
        }
        console.log(chalk.bold('\nReasoning'));
        console.log(result.explanation);
        console.log(chalk.bold('\nDrafted promises'));
        console.log(result.draftPromises);
        console.log(chalk.bold('\nDrafted fault schedule templates'));
        console.log(result.draftTemplates);
        console.log(chalk.gray('\nThese are drafts: review them, add them to your config, and run `sibyl run`.'));
      } catch (err) {
        handleError(err);
      }
    });

  // --- DOCTOR ---
  program
    .command('doctor')
    .description('Check the config loads, the API is reachable, and optional tooling is present')
    .option('-c, --config <file>', 'Path to the Sibyl config', DEFAULT_CONFIG)
    .action(async (options) => {
      let problems = 0;
      const row = (state: 'ok' | 'fail' | 'skip', name: string, info: string) => {
        const tag = state === 'ok' ? chalk.green('PASS') : state === 'fail' ? chalk.red('FAIL') : chalk.gray('SKIP');
        if (state === 'fail') problems++;
        console.log(`[${tag}] ${chalk.bold(name)} ${chalk.gray(info)}`);
      };
      console.log(chalk.bold('\nSibyl doctor'));

      try {
        const loaded = await loadConfig(options.config);
        row('ok', 'Config', `${loaded.config.promises.length} promises, ${loaded.config.templates.length} templates, drivers: ${(loaded.config.drivers ?? []).map(d => typeof d === 'string' ? d : d.domain).join(', ') || 'none'}`);
      } catch (err: any) {
        row('fail', 'Config', err.message.split('\n')[0]);
      }

      const api = apiFromEnv();
      if (!api) {
        row('skip', 'API', 'SIBYL_API_URL not set; sessions stay local');
      } else {
        try {
          const health = await api.health();
          row('ok', 'API', `${process.env.SIBYL_API_URL} · ${health.sessions} sessions · writes ${health.auth.writesRequireToken ? 'need a token' : 'open'}`);
          if (health.auth.writesRequireToken && !process.env.SIBYL_API_TOKEN) row('fail', 'API token', 'the API requires SIBYL_API_TOKEN for uploads');
        } catch (err: any) {
          row('fail', 'API', err.message);
        }
      }

      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) row('skip', 'Anthropic key', 'ANTHROPIC_API_KEY not set; explain/investigate/retro unavailable');
      else if (!key.startsWith('sk-ant-')) row('fail', 'Anthropic key', 'does not look like an Anthropic key (expected sk-ant-…)');
      else row('ok', 'Anthropic key', 'present (not validated online)');

      try {
        execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
        row('ok', 'Docker', 'daemon reachable (needed only for sandboxed workers)');
      } catch {
        row('skip', 'Docker', 'daemon not reachable; only needed for sandboxed workers');
      }

      console.log(problems ? chalk.red(`\n${problems} problem(s).`) : chalk.green('\nNo problems.'));
      if (problems) process.exitCode = 1;
    });

  return program;
}
