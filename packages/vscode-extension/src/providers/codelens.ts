import * as vscode from 'vscode';

export class SibylCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();

    // A Sibyl config is `export default defineConfig({ ... })` (see `sibyl init`).
    const regex = /\bdefineConfig\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const line = document.positionAt(match.index).line;
      const range = new vscode.Range(line, 0, line, 0);

      // No pass-rate lens: the extension does not query the API, so it has no real number to show.
      codeLenses.push(new vscode.CodeLens(range, {
        title: 'Run Sibyl',
        command: 'sibyl.runLocal',
        arguments: [document.uri],
      }));
    }

    return codeLenses;
  }
}
