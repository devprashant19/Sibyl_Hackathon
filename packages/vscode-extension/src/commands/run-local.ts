import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const CONFIG_NAMES = ['sibyl.config.ts', 'sibyl.config.mts', 'sibyl.config.js', 'sibyl.config.mjs'];

/** The config to run: the file itself if it is a Sibyl config, else the nearest one above it. */
export function findConfig(file: string, stopAt?: string): string | undefined {
  if (CONFIG_NAMES.includes(path.basename(file))) return file;
  let dir = path.dirname(file);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir || (stopAt && path.relative(stopAt, dir) === '')) return undefined;
    dir = parent;
  }
}

/**
 * The `sibyl` executable: the `sibyl.cliPath` setting, else a project-local node_modules/.bin/sibyl
 * (the CLI is a workspace package, not published to npm), else `sibyl` on PATH.
 */
function resolveCli(configDir: string): string {
  const configured = vscode.workspace.getConfiguration('sibyl').get<string>('cliPath');
  if (configured) return configured;
  const binName = process.platform === 'win32' ? 'sibyl.cmd' : 'sibyl';
  let dir = configDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '.bin', binName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return 'sibyl';
    dir = parent;
  }
}

export function registerRunLocalCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('sibyl.runLocal', async (uri?: vscode.Uri) => {
    const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
    if (!targetUri || targetUri.scheme !== 'file') {
      vscode.window.showErrorMessage('Sibyl: No active file to run.');
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(targetUri);
    const config = findConfig(targetUri.fsPath, folder?.uri.fsPath);
    if (!config) {
      vscode.window.showErrorMessage('Sibyl: No sibyl.config.ts found next to or above this file. Run `sibyl init` first.');
      return;
    }

    const cwd = path.dirname(config);
    const iterations = vscode.workspace.getConfiguration('sibyl').get<number>('defaultIterations');
    const strong = (value: string): vscode.ShellQuotedString => ({ value, quoting: vscode.ShellQuoting.Strong });

    // Arguments are passed individually and quoted by VS Code for the active shell, so paths with
    // spaces or shell metacharacters are never interpreted by the shell.
    const args: vscode.ShellQuotedString[] = [strong('run'), strong('-c'), strong(config)];
    if (iterations && Number.isInteger(iterations) && iterations > 0) {
      args.push(strong('-n'), strong(String(iterations)));
    }

    const execution = new vscode.ShellExecution(strong(resolveCli(cwd)), args, { cwd });
    const task = new vscode.Task(
      { type: 'sibyl', config },
      folder ?? vscode.TaskScope.Workspace,
      `run ${path.basename(config)}`,
      'Sibyl',
      execution,
    );
    await vscode.tasks.executeTask(task);
  });
}
