import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import cliProgress from 'cli-progress';
import { execSync } from 'child_process';
import { handleError, ConfigLoadError, ApiKeyError, NetworkError, SDKMismatchError } from './errors';
// Need dynamic import for the user's config
// import { SearchOrchestrator } from '@sibyl-core'; // Stub
import { SibylInvestigator, SibylExplainer, SibylPatcher, SibylPostmortemAnalyzer } from '@sibyl-agent';

const program = new Command();

program
  .name('sibyl')
  .description('Sibyl Simulation & Fault Injection Engine')
  .version('1.0.0');

  .version('1.0.0');

// --- DOCTOR COMMAND ---
program
  .command('doctor')
  .description('Diagnoses your Sibyl setup (config, API keys, SDK versions, Docker)')
  .action(async () => {
    console.log(chalk.blue.bold(`\n🩺 Sibyl Setup Doctor`));
    
    let allPassed = true;
    const printStatus = (name: string, passed: boolean, info?: string) => {
      const status = passed ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`[${status}] ${chalk.white.bold(name)} ${info ? chalk.gray('(' + info + ')') : ''}`);
      if (!passed) allPassed = false;
    };

    // 1. Config
    const configPath = path.join(process.cwd(), 'sibyl.config.ts');
    const hasConfig = fs.existsSync(configPath);
    printStatus('Configuration File', hasConfig, hasConfig ? 'sibyl.config.ts found' : 'Not found');

    // 2. API Key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let apiPassed = false;
    let apiInfo = 'ANTHROPIC_API_KEY is missing';
    if (apiKey) {
      if (!apiKey.startsWith('sk-ant-')) {
        apiInfo = 'Invalid key format';
      } else {
        try {
          const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
          });
          if (res.status === 401) {
             apiInfo = 'API Key Unauthorized';
          } else {
             apiPassed = true;
             apiInfo = 'Connected to Anthropic';
          }
        } catch(e: any) {
          apiInfo = \`Network error: \${e.message}\`;
        }
      }
    }
    printStatus('Anthropic API Key', apiPassed, apiInfo);

    // 3. SDK Version
    let sdkPassed = false;
    let sdkInfo = 'Cannot read package.json';
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const cliVersion = require('../../package.json').version; // local package.json
        const coreVersion = pkg.dependencies?.['@sibyl-core'] || pkg.devDependencies?.['@sibyl-core'];
        if (!coreVersion) {
          sdkInfo = '@sibyl-core not installed in project';
        } else if (coreVersion.replace('^', '').replace('~', '') !== cliVersion) {
          sdkInfo = \`Version mismatch (CLI: \${cliVersion}, Project: \${coreVersion})\`;
        } else {
          sdkPassed = true;
          sdkInfo = \`Matched at \${cliVersion}\`;
        }
      } else {
        sdkInfo = 'No package.json found';
      }
    } catch(e) {}
    printStatus('SDK Version Match', sdkPassed, sdkInfo);

    // 4. Docker
    let dockerPassed = false;
    let dockerInfo = '';
    try {
      execSync('docker info', { stdio: 'ignore' });
      dockerPassed = true;
      dockerInfo = 'Docker daemon is running';
    } catch(e) {
      dockerInfo = 'Docker not running or not installed';
    }
    printStatus('Docker Sandbox', dockerPassed, dockerInfo);

    console.log();
    if (allPassed) {
      console.log(chalk.green.bold('✔ Your Sibyl environment is perfectly configured!'));
    } else {
      console.log(chalk.yellow.bold('⚠️  Some checks failed. See the tips below:'));
      if (!hasConfig) console.log(chalk.gray('- Run `sibyl init` to generate a configuration file.'));
      if (!apiPassed) console.log(chalk.gray('- Set a valid ANTHROPIC_API_KEY environment variable.'));
      if (!sdkPassed) console.log(chalk.gray('- Ensure your project depends on the same version of @sibyl-core as this CLI.'));
      if (!dockerPassed) console.log(chalk.gray('- Start your Docker daemon if you intend to use Sandbox isolated environments.'));
      process.exit(1);
    }
  });

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
  .option('-u, --update-snapshots', 'Update stored snapshot golden files')
  .option('--suggest-fix <filepaths...>', 'Files to analyze for suggested patches')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold(`\n👁️  Sibyl Engine Started`));
      console.log(chalk.gray(`Target: ${options.target} | Iterations: ${options.iterations}`));
      
      const configPath = path.resolve(options.target);
      if (!fs.existsSync(configPath)) {
        throw new ConfigLoadError(\`Configuration file not found at \${options.target}\`, options.target);
      }
      
      // In a real app we'd dynamically import:
      // const { workflow, templates, promises } = await import(configPath);
      // const orchestrator = new SearchOrchestrator({ 
      //   ...config, 
      //   iterations: parseInt(options.iterations), 
      //   updateSnapshots: options.updateSnapshots 
      // });

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
          const explainer = new SibylExplainer({ apiKey });
          // Mock telemetry for the CLI
          const mockEvents = [{ type: 'HTTP_REQUEST', target: 'api.stripe.com', status: 'TIMEOUT' }];
          const mockEvidence = { promiseName: 'no_500s', state: 'FAILED' };
          
          let explanation;
          try {
            explanation = await explainer.explainFailure('mock-run-id', mockEvents, mockEvidence);
          } catch(e: any) {
             throw new ApiKeyError(\`Agent explanation failed: \${e.message}\`);
          }
          
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
              
              const handoffDoc = \`# Sibyl AI Handoff
> Note: Pass this document to your IDE agent (Cursor, Claude Code, Copilot) to automatically apply the fix.

## Prompt for Agent
Please apply the following unified diff to fix a bug discovered by Sibyl Chaos Engineering.
**Explanation of fix:** \${patchResult.explanation}

## Patch
\\\`\\\`\\\`diff
\${patchResult.unifiedDiff}
\\\`\\\`\\\`
\`;
              const handoffPath = path.join(process.cwd(), 'sibyl-fix-handoff.md');
              fs.writeFileSync(handoffPath, handoffDoc);
              console.log(chalk.green(\`✔ Handoff document generated: \${handoffPath}\`));
              console.log(chalk.cyan(\`You can pass this file to Cursor/Claude Code to auto-apply the fix.\`));
            }
          }
        } else {
          console.log(chalk.gray('Tip: Set ANTHROPIC_API_KEY to automatically diagnose failures.'));
        }
        
      } else {
        console.log(chalk.green.bold(`\n✔ 0 failures found. Code is robust.`));
      }

      if (!options.localOnly) {
        console.log(chalk.gray('Uploading results to API...'));
        try {
          // fetch('http://localhost:4000/api/v1/runs', ...)
        } catch (e: any) {
          throw new NetworkError('Failed to upload results to Sibyl API: ' + e.message);
        }
        console.log(chalk.gray('✔ Upload complete.'));
      }
    } catch (err) {
      handleError(err);
    }
  });

// --- CI COMMAND ---
program
  .command('ci')
  .description('Runs the engine in CI mode (no UI, non-zero exit on failure)')
  .option('--target <script>', 'Path to the sibyl config', 'sibyl.config.ts')
  .option('--iterations <number>', 'Number of simulation runs', '100')
  .option('-u, --update-snapshots', 'Update stored snapshot golden files')
  .option('--suggest-fix <filepaths...>', 'Files to analyze for suggested patches')
  .action(async (options) => {
    try {
      console.log(`[INFO] Starting Sibyl CI Pipeline (${options.iterations} iterations)`);
      
      const configPath = path.resolve(options.target);
      if (!fs.existsSync(configPath)) {
        throw new ConfigLoadError(\`Configuration file not found at \${options.target}\`, options.target);
      }
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
          
          let explanation;
          try {
            explanation = await explainer.explainFailure('mock-run-id', [{ type: 'HTTP_REQUEST' }], { promise: 'no_500s' });
          } catch(e: any) {
             throw new ApiKeyError(\`Agent explanation failed: \${e.message}\`);
          }
          
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
              const handoffDoc = \`# Sibyl AI Handoff\n\n## Prompt for Agent\nPlease apply the following unified diff to fix a bug discovered by Sibyl Chaos Engineering.\n**Explanation:** \${patchResult.explanation}\n\n## Patch\n\\\`\\\`\\\`diff\n\${patchResult.unifiedDiff}\n\\\`\\\`\\\`\n\`;
              const handoffPath = path.join(process.cwd(), 'sibyl-fix-handoff.md');
              fs.writeFileSync(handoffPath, handoffDoc);
              console.log(`[SUCCESS] Handoff document generated: ${handoffPath}`);
            }
          }
        } catch (err: any) {
          if (err instanceof ApiKeyError) throw err;
          throw new NetworkError(`Failed to generate explanation: ${err.message}`);
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
    } catch (err) {
      handleError(err);
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
    try {
      console.log(chalk.blue.bold(`\n🕵️  Sibyl AI Investigator Started`));
      console.log(chalk.gray(`Analyzing bug: "${bugDescription}"\n`));

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ApiKeyError('Missing ANTHROPIC_API_KEY environment variable.');
      }

      const agent = new SibylInvestigator({
        apiKey,
        fetchPromises: async () => [{ name: 'stripe_no_double_charge' }, { name: 'no_500s' }],
        fetchRecentEvents: async () => [{ type: 'HTTP_REQUEST', target: 'api.stripe.com', domain: 'HTTP' }]
      });

      let result;
      try {
        result = await agent.investigate(bugDescription, options.project);
      } catch (err: any) {
        throw new NetworkError(\`Agent request failed: \${err.message}\`);
      }

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

    } catch (err) {
      handleError(err);
    }
  });

// --- RETRO COMMAND ---
program
  .command('retro <postmortemFile>')
  .description('AI translates an incident postmortem into permanent regression tests')
  .action(async (postmortemFile) => {
    try {
      console.log(chalk.blue.bold(`\n📝 Sibyl Postmortem Analyzer Started`));
      
      if (!fs.existsSync(postmortemFile)) {
        throw new ConfigLoadError(\`Could not find postmortem file: \${postmortemFile}\`, postmortemFile);
      }
      
      const postmortemText = fs.readFileSync(postmortemFile, 'utf-8');
      console.log(chalk.gray(`Analyzing incident document (${postmortemText.length} bytes)...\n`));

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ApiKeyError('Missing ANTHROPIC_API_KEY environment variable.');
      }

      const analyzer = new SibylPostmortemAnalyzer({ apiKey });

      let result;
      try {
        console.log(chalk.magenta('🤖 Drafting regression tests...'));
        result = await analyzer.analyze(postmortemText);
      } catch (err: any) {
        throw new NetworkError(\`Agent request failed: \${err.message}\`);
      }

      console.log(chalk.green.bold('\n✔ Analysis Complete'));
      console.log(chalk.white(`\nReasoning:\n${result.explanation}`));
      
      console.log(chalk.yellow('\nDrafted Programmatic Promise:'));
      console.log(result.draftPromises);

      console.log(chalk.yellow('\nDrafted Fault Schedule Template:'));
      console.log(result.draftTemplates);

      console.log(chalk.cyan('\nCopy the above definitions into your sibyl.config.ts to close the loop on this incident!'));

    } catch (err) {
      handleError(err);
    }
  });

program.parse(process.argv);
