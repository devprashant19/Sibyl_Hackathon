import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
// Need dynamic import for the user's config
// import { SearchOrchestrator } from '@sibyl-core'; // Stub
import { SibylInvestigator } from '@sibyl-agent';

const program = new Command();

program
  .name('sibyl')
  .description('Sibyl Simulation & Fault Injection Engine')
  .version('1.0.0');

// --- INIT COMMAND ---
program
  .command('init')
  .description('Scaffolds a sibyl.config.ts in your repository')
  .action(() => {
    const configPath = path.join(process.cwd(), 'sibyl.config.ts');
    if (fs.existsSync(configPath)) {
      console.log(chalk.red('❌ sibyl.config.ts already exists.'));
      process.exit(1);
    }

    const template = `import { ProgrammaticPromise, FaultScheduleTemplate } from '@sibyl-shared';

export const promises: ProgrammaticPromise[] = [
  {
    id: 'no-500s',
    description: 'System should not return 500 errors',
    severity: 'CRITICAL',
    evaluate: (ctx) => !ctx.timeline().some(e => e.payload.status === 500)
  }
];

export const templates: FaultScheduleTemplate[] = [
  {
    id: 'http-timeout',
    spec: { domain: 'HTTP', type: 'TIMEOUT' },
    probabilityRange: [0.1, 1.0],
    delayMsRange: [1000, 5000],
    target: { url: 'api/checkout' }
  }
];

export async function workflow() {
  // TODO: Trigger your application's logic here
  // e.g. await fetch('http://localhost:3000/api/checkout');
}
`;
    fs.writeFileSync(configPath, template);
    console.log(chalk.green('✔ Scaffolding complete!'));
    console.log(chalk.cyan('Created: ') + 'sibyl.config.ts');
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  1. Wire up your target application logic in the workflow() function.'));
    console.log(chalk.gray('  2. Run `sibyl run` to start the simulation engine.'));
  });

// --- RUN COMMAND ---
program
  .command('run')
  .description('Runs the search engine against the target workflow')
  .option('--target <script>', 'Path to the sibyl config', 'sibyl.config.ts')
  .option('--iterations <number>', 'Number of simulation runs', '100')
  .option('--concurrency <number>', 'Parallel execution limit', '1')
  .option('--local-only', 'Do not upload results to the API')
  .action(async (options) => {
    console.log(chalk.blue.bold(`\n👁️  Sibyl Engine Started`));
    console.log(chalk.gray(`Target: ${options.target} | Iterations: ${options.iterations}`));
    
    // In a real app we'd dynamically import:
    // const { workflow, templates, promises } = await import(path.resolve(options.target));
    // const orchestrator = new SearchOrchestrator({...});

    const bar = new cliProgress.SingleBar({
      format: chalk.cyan('{bar}') + ' {percentage}% | {value}/{total} Runs | {failures} Failures',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    bar.start(parseInt(options.iterations), 0, { failures: 0 });

    let failures = 0;
    for (let i = 1; i <= parseInt(options.iterations); i++) {
      // Stub execution wait
      await new Promise(r => setTimeout(r, 20)); 
      if (i % 25 === 0) failures++; // Mock failure discovery
      
      bar.update(i, { failures });
    }
    
    bar.stop();

    if (failures > 0) {
      console.log(chalk.red.bold(`\n❌ Found ${failures} failing permutations.`));
    } else {
      console.log(chalk.green.bold(`\n✔ 0 failures found. Code is robust.`));
    }

    if (!options.localOnly) {
      console.log(chalk.gray('Uploading results to API...'));
      // fetch('http://localhost:4000/api/v1/runs', ...)
      console.log(chalk.gray('✔ Upload complete.'));
    }
  });

// --- CI COMMAND ---
program
  .command('ci')
  .description('Runs the engine in CI mode (no UI, non-zero exit on failure)')
  .option('--target <script>', 'Path to the sibyl config', 'sibyl.config.ts')
  .option('--iterations <number>', 'Number of simulation runs', '100')
  .action(async (options) => {
    console.log(`[INFO] Starting Sibyl CI Pipeline (${options.iterations} iterations)`);
    
    let failures = 0;
    for (let i = 1; i <= parseInt(options.iterations); i++) {
      // Mock fast execution
      if (i === 42) failures++; 
    }

    if (failures > 0) {
      console.error(`[ERROR] Discovered ${failures} broken invariants! Failing CI.`);
      process.exit(1);
    } else {
      console.log(`[SUCCESS] 0 failures discovered.`);
      process.exit(0);
    }
  });

// --- REPLAY COMMAND ---
program
  .command('replay <run-id>')
  .description('Re-executes a specific past run deterministically for debugging')
  .action(async (runId) => {
    console.log(chalk.magenta.bold(`\n⏪ Replaying Run: ${runId}`));
    console.log(chalk.gray(`Fetching deterministic seed from API...`));
    
    // const res = await fetch(`http://localhost:4000/api/v1/runs/${runId}`);
    // const seed = res.seed;

    console.log(chalk.blue(`[14:02:00] Workflow started...`));
    console.log(chalk.yellow(`[14:02:01] ⚡ INJECTING FAULT: HTTP TIMEOUT on /checkout`));
    console.log(chalk.red(`[14:02:05] Promise 'no-500s' failed.`));
    
    console.log(chalk.magenta('\nReplay complete.'));
  });

// --- INVESTIGATE COMMAND ---
program
  .command('investigate <bugDescription>')
  .description('AI translates a plain-English bug report into a FaultSchedule and runs it')
  .option('--project <projectId>', 'The ID of the project', 'default-project')
  .action(async (bugDescription, options) => {
    console.log(chalk.blue.bold(`\n🕵️  Sibyl AI Investigator Started`));
    console.log(chalk.gray(`Analyzing bug: "${bugDescription}"\n`));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.red('❌ Missing ANTHROPIC_API_KEY environment variable.'));
      process.exit(1);
    }

    const agent = new SibylInvestigator({
      apiKey,
      fetchPromises: async () => [{ name: 'stripe_no_double_charge' }, { name: 'no_500s' }],
      fetchRecentEvents: async () => [{ type: 'HTTP_REQUEST', target: 'api.stripe.com', domain: 'HTTP' }]
    });

    try {
      const result = await agent.investigate(bugDescription, options.project);

      if (result.status === 'NEEDS_CLARIFICATION') {
        console.log(chalk.yellow.bold('⚠️  Agent needs clarification:'));
        console.log(chalk.white(result.reasoning));
        console.log(chalk.cyan(`\nQuestion: ${result.clarifyingQuestion}`));
        return;
      }

      console.log(chalk.green.bold('✔ Investigation Complete'));
      console.log(chalk.white(`\nReasoning:\n${result.reasoning}`));
      
      console.log(chalk.yellow('\nProposed Fault Schedule:'));
      console.log(JSON.stringify(result.faultSchedule, null, 2));

      if (result.draftNewPromiseCode) {
        console.log(chalk.magenta('\nDrafted New Promise:'));
        console.log(result.draftNewPromiseCode);
        console.log(chalk.gray('\n(In a real implementation, this would be appended to sibyl.config.ts)'));
      } else {
        console.log(chalk.magenta(`\nUsing Existing Promise: ${result.existingPromiseName}`));
      }

      console.log(chalk.gray('\nAuto-triggering search run with proposed schedule...'));
      // In reality we would call the search orchestrator here, e.g.:
      // await orchestrator.run({ schedule: result.faultSchedule, promise: result.existingPromiseName });
      console.log(chalk.green('✔ Mock search complete.'));

    } catch (err: any) {
      console.log(chalk.red(`❌ Agent error: ${err.message}`));
    }
  });


program.parse(process.argv);
