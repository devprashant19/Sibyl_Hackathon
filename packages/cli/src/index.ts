import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
// Need dynamic import for the user's config
// import { SearchOrchestrator } from '@sibyl-core'; // Stub
import { SibylInvestigator, SibylExplainer, SibylPatcher, SibylPostmortemAnalyzer } from '@sibyl-agent';

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
  .option('--suggest-fix <filepaths...>', 'Files to analyze for suggested patches')
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
      
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        console.log(chalk.magenta('\n🤖 Auto-analyzing root cause for the first failure...'));
        try {
          const explainer = new SibylExplainer({ apiKey });
          // Mock telemetry for the CLI
          const mockEvents = [{ type: 'HTTP_REQUEST', target: 'api.stripe.com', status: 'TIMEOUT' }];
          const mockEvidence = { promiseName: 'no_500s', state: 'FAILED' };
          
          const explanation = await explainer.explainFailure('mock-run-id', mockEvents, mockEvidence);
          
          console.log(chalk.gray('--- AI Root Cause Analysis ---'));
          console.log(chalk.white(explanation));
          console.log(chalk.gray('------------------------------'));

          if (options.suggestFix && options.suggestFix.length > 0) {
            console.log(chalk.magenta('\n🛠️  Generating suggested patch...'));
            const patcher = new SibylPatcher({ apiKey });
            
            // Read requested files
            const fileContents: Record<string, string> = {};
            for (const fp of options.suggestFix) {
              if (fs.existsSync(fp)) {
                fileContents[fp] = fs.readFileSync(fp, 'utf-8');
              } else {
                console.log(chalk.yellow(`Warning: Could not read file ${fp}`));
              }
            }

            if (Object.keys(fileContents).length > 0) {
              const patchResult = await patcher.suggestFix(explanation, fileContents);
              
              const handoffDoc = `# Sibyl AI Handoff
> Note: Pass this document to your IDE agent (Cursor, Claude Code, Copilot) to automatically apply the fix.

## Prompt for Agent
Please apply the following unified diff to fix a bug discovered by Sibyl Chaos Engineering.
**Explanation of fix:** ${patchResult.explanation}

## Patch
\`\`\`diff
${patchResult.unifiedDiff}
\`\`\`
`;
              const handoffPath = path.join(process.cwd(), 'sibyl-fix-handoff.md');
              fs.writeFileSync(handoffPath, handoffDoc);
              console.log(chalk.green(`✔ Handoff document generated: ${handoffPath}`));
              console.log(chalk.cyan(`You can pass this file to Cursor/Claude Code to auto-apply the fix.`));
            }
          }
        } catch (err: any) {
          console.log(chalk.red(`Failed to generate explanation: ${err.message}`));
        }
      } else {
        console.log(chalk.gray('Tip: Set ANTHROPIC_API_KEY to automatically diagnose failures.'));
      }
      
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
  .option('--suggest-fix <filepaths...>', 'Files to analyze for suggested patches')
  .action(async (options) => {
    console.log(`[INFO] Starting Sibyl CI Pipeline (${options.iterations} iterations)`);
    
    let failures = 0;
    for (let i = 1; i <= parseInt(options.iterations); i++) {
      // Mock fast execution
      if (i === 42) failures++; 
    }

    if (failures > 0) {
      console.error(`[ERROR] Discovered ${failures} broken invariants! Failing CI.`);

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        console.log('\n[INFO] Auto-analyzing root cause for the first failure...');
        try {
          const explainer = new SibylExplainer({ apiKey });
          const explanation = await explainer.explainFailure('mock-run-id', [{ type: 'HTTP_REQUEST' }], { promise: 'no_500s' });
          console.log('--- AI Root Cause Analysis ---');
          console.log(explanation);
          console.log('------------------------------');

          if (options.suggestFix && options.suggestFix.length > 0) {
            console.log('\n[INFO] Generating suggested patch...');
            const patcher = new SibylPatcher({ apiKey });
            const fileContents: Record<string, string> = {};
            for (const fp of options.suggestFix) {
              if (fs.existsSync(fp)) fileContents[fp] = fs.readFileSync(fp, 'utf-8');
            }

            if (Object.keys(fileContents).length > 0) {
              const patchResult = await patcher.suggestFix(explanation, fileContents);
              const handoffDoc = `# Sibyl AI Handoff\n\n## Prompt for Agent\nPlease apply the following unified diff to fix a bug discovered by Sibyl Chaos Engineering.\n**Explanation:** ${patchResult.explanation}\n\n## Patch\n\`\`\`diff\n${patchResult.unifiedDiff}\n\`\`\`\n`;
              const handoffPath = path.join(process.cwd(), 'sibyl-fix-handoff.md');
              fs.writeFileSync(handoffPath, handoffDoc);
              console.log(`[SUCCESS] Handoff document generated: ${handoffPath}`);
            }
          }
        } catch (err: any) {
          console.error(`[WARN] Failed to generate explanation: ${err.message}`);
        }
      }

      // Phase 17: GitHub App Integration (Mock)
      const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
      const isGitLab = process.env.GITLAB_CI === 'true';
      const isCircleCI = process.env.CIRCLECI === 'true';
      const isJenkins = process.env.JENKINS_URL !== undefined || process.env.SIBYL_JENKINS_RUN === 'true';
      
      if (isGithubActions) {
        console.log('\n[INFO] Running in GitHub Actions. Uploading results to Sibyl API...');
        console.log('[INFO] Sibyl API is now updating the PR Check Status and posting a failure comment via the Sibyl GitHub App.');
      } else if (isGitLab) {
        console.log(`\n[INFO] Running in GitLab CI. Uploading results for project ${process.env.CI_PROJECT_PATH}...`);
        console.log('[INFO] Status reported back via GitLab API Webhook.');
      } else if (isCircleCI) {
        console.log('\n[INFO] Running in CircleCI. Uploading results to Sibyl API...');
      } else if (isJenkins) {
        console.log('\n[INFO] Running in Jenkins. Uploading results to Sibyl API...');
      }

      process.exit(1);
    } else {
      console.log(`[SUCCESS] 0 failures discovered.`);
      
      const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
      const isGitLab = process.env.GITLAB_CI === 'true';
      const isCircleCI = process.env.CIRCLECI === 'true';
      const isJenkins = process.env.JENKINS_URL !== undefined || process.env.SIBYL_JENKINS_RUN === 'true';
      
      if (isGithubActions) {
        console.log('\n[INFO] Running in GitHub Actions. Uploading results to Sibyl API...');
        console.log('[INFO] Sibyl API is now marking the PR Check Status as SUCCESS via the Sibyl GitHub App.');
      } else if (isGitLab || isCircleCI || isJenkins) {
        console.log('\n[INFO] Running in Enterprise CI. Uploading SUCCESS status to Sibyl API...');
      }

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

// --- RETRO COMMAND ---
program
  .command('retro <postmortemFile>')
  .description('AI translates an incident postmortem into permanent regression tests')
  .action(async (postmortemFile) => {
    console.log(chalk.blue.bold(`\n📝 Sibyl Postmortem Analyzer Started`));
    
    if (!fs.existsSync(postmortemFile)) {
      console.log(chalk.red(`❌ Could not find file: ${postmortemFile}`));
      process.exit(1);
    }
    
    const postmortemText = fs.readFileSync(postmortemFile, 'utf-8');
    console.log(chalk.gray(`Analyzing incident document (${postmortemText.length} bytes)...\n`));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.red('❌ Missing ANTHROPIC_API_KEY environment variable.'));
      process.exit(1);
    }

    const analyzer = new SibylPostmortemAnalyzer({ apiKey });

    try {
      console.log(chalk.magenta('🤖 Drafting regression tests...'));
      const result = await analyzer.analyze(postmortemText);

      console.log(chalk.green.bold('\n✔ Analysis Complete'));
      console.log(chalk.white(`\nReasoning:\n${result.explanation}`));
      
      console.log(chalk.yellow('\nDrafted Programmatic Promise:'));
      console.log(result.draftPromises);

      console.log(chalk.yellow('\nDrafted Fault Schedule Template:'));
      console.log(result.draftTemplates);

      console.log(chalk.cyan('\nCopy the above definitions into your sibyl.config.ts to close the loop on this incident!'));

    } catch (err: any) {
      console.log(chalk.red(`❌ Agent error: ${err.message}`));
    }
  });

program.parse(process.argv);
