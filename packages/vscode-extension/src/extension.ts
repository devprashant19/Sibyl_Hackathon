import * as vscode from 'vscode';
import { SibylCodeLensProvider } from './providers/codelens';
import { registerRunLocalCommand } from './commands/run-local';
import { setupDiagnostics } from './providers/diagnostics';

export function activate(context: vscode.ExtensionContext) {
  console.log('Sibyl Chaos Engine extension is now active.');

  // 1. CodeLens for pass rates
  const codeLensProvider = new SibylCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'typescript' },
      codeLensProvider
    )
  );

  // 2. Local runner command
  context.subscriptions.push(registerRunLocalCommand());

  // 3. Inline diagnostics (mocking API fetch)
  const collection = vscode.languages.createDiagnosticCollection('sibyl');
  context.subscriptions.push(collection);
  setupDiagnostics(collection, context);
}

export function deactivate() {}
