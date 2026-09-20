import * as vscode from 'vscode';

export class SibylCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    
    // Simple regex to find promise definitions (e.g., export const promises: ProgrammaticPromise[] =)
    const regex = /promises:\s*ProgrammaticPromise\[\]\s*=/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const line = document.positionAt(match.index).line;
      const range = new vscode.Range(line, 0, line, 0);

      // Mock fetching pass rate from Sibyl API
      const mockPassRate = 87.5;

      const lens = new vscode.CodeLens(range, {
        title: `Sibyl: ${mockPassRate}% Pass Rate (Last 30 Days) ⚠️`,
        command: "sibyl.runLocal",
        arguments: [document.uri]
      });

      codeLenses.push(lens);
      
      const lens2 = new vscode.CodeLens(range, {
        title: `▶️ Run Chaos Local`,
        command: "sibyl.runLocal",
        arguments: [document.uri]
      });
      codeLenses.push(lens2);
    }

    return codeLenses;
  }
}
