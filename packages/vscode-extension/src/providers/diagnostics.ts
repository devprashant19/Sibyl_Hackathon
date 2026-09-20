import * as vscode from 'vscode';

export function setupDiagnostics(collection: vscode.DiagnosticCollection, context: vscode.ExtensionContext) {
  
  // Update diagnostics when a file opens
  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document, collection);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateDiagnostics(editor.document, collection);
      }
    })
  );
}

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  // Clear existing
  collection.delete(document.uri);

  // Mocking: If the file is 'handler.ts' or contains 'processPayment', we flag a mock AI root cause
  const text = document.getText();
  if (text.includes('processPayment')) {
    
    // Find the line containing 'processPayment'
    const lines = text.split('\\n');
    let targetLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('processPayment')) {
        targetLine = i;
        break;
      }
    }

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(targetLine, 0, targetLine, 50),
      "Sibyl AI: This function is vulnerable to double-charges during HTTP timeouts. Missing idempotency key.",
      vscode.DiagnosticSeverity.Warning
    );

    diagnostic.source = "Sibyl Chaos Engine";
    diagnostic.code = "SIBYL_INV_001";

    collection.set(document.uri, [diagnostic]);
  }
}
