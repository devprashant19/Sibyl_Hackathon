# Sibyl VS Code Extension

Inline chaos engineering support for Visual Studio Code.

## Overview

This extension brings Sibyl's simulation engine directly into your editor. It provides inline promise linting, one-click run triggering, and embedded result viewing — so you can find and fix concurrency bugs without leaving your IDE.

## Features

### Inline Promise Diagnostics

The extension parses `sibyl.config.ts` and any files containing `definePromise()` calls, providing:

- **CodeLens** above each promise showing its last pass/fail status.
- **Diagnostic warnings** when a promise references a fault domain that has no driver installed.
- **Quick fixes** for common promise definition issues.

### Run From Editor

- **CodeLens: "Run Sibyl"** — Appears above each promise. Click to trigger a simulation run targeting that specific promise.
- **Command Palette: "Sibyl: Run All Promises"** — Runs all promises in the current project.
- **Command Palette: "Sibyl: Replay Seed"** — Replays a specific seed for a deterministic reproduction.

### Result Panel

When a run completes, results are displayed in a dedicated Sibyl panel:

- **Event timeline** with color-coded fault injections.
- **Promise results** with pass/fail badges.
- **AI root-cause analysis** (if AI features are enabled).
- **One-click navigation** to the source line where the fault was injected.

## Installation

1. Install from the VS Code Marketplace (search "Sibyl").
2. Or build from source:

```bash
cd packages/vscode-extension
npm install
npm run compile
# Press F5 in VS Code to launch the extension development host
```

## Configuration

The extension reads from VS Code settings:

```json
{
  "sibyl.apiUrl": "http://localhost:4000",
  "sibyl.defaultIterations": 100,
  "sibyl.defaultStrategy": "mcts",
  "sibyl.showCodeLens": true
}
```

## Requirements

- VS Code ≥ 1.85
- Node.js ≥ 20 (for the CLI backend)
- A running Sibyl API server (local or remote)

## Module Structure

```
src/
├── extension.ts       # Extension activation and command registration
├── codelens.ts        # CodeLens provider for promise definitions
├── diagnostics.ts     # Diagnostic provider for promise linting
├── panel.ts           # Webview panel for result display
└── commands.ts        # Command implementations (run, replay, etc.)
```
