import * as vscode from 'vscode';

export function registerRunLocalCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('sibyl.runLocal', (uri?: vscode.Uri) => {
    
    const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      vscode.window.showErrorMessage('Sibyl: No active file to run.');
      return;
    }

    const terminal = vscode.window.createTerminal('Sibyl Chaos Engine');
    terminal.show();

    // Run the local CLI
    terminal.sendText(`npx @sibyl/cli run --target ${targetUri.fsPath} --iterations 50`);
    
  });
}
