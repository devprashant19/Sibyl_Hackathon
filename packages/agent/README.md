# @sibyl/agent

AI-powered agent suite for automated bug investigation, root-cause analysis, patch generation, and incident postmortem reports.

## Overview

This package contains four specialized AI agents that augment the Sibyl simulation engine with LLM-powered reasoning. All agents are powered by Anthropic's Claude API and use structured tool calls to ground their analysis in real captured events — they never guess or hallucinate targets.

## Agents

### Investigator (`SibylInvestigator`)

**Input:** A natural-language bug report + a project ID.
**Output:** A concrete `FaultSchedule` that can reproduce the described bug.

The Investigator works by:
1. Fetching existing promise definitions via the `get_promises` tool.
2. Fetching recent captured events via the `get_recent_events` tool (real HTTP endpoints, DB tables, queue topics).
3. Reasoning about what fault conditions could produce the described behavior.
4. Calling `submit_investigation` with a generated fault schedule, or asking a clarifying question if the report is too vague.

### Explainer (`SibylExplainer`)

**Input:** A failed simulation run's event timeline.
**Output:** A plain-language root-cause explanation grounded in the evidence.

The Explainer receives the full `CapturedEvent[]` timeline from a failed run and produces a structured analysis: what happened, why the promise was violated, and what the exact causal chain was.

### Patcher (`SibylPatcher`)

**Input:** An Explainer analysis + relevant source code.
**Output:** A code diff that fixes the identified bug.

The Patcher reads the Explainer's root-cause analysis, fetches the relevant source file(s), and generates a minimal code change that addresses the identified issue.

### Postmortem (`SibylPostmortem`)

**Input:** A failed run's full context.
**Output:** A structured incident report with timeline, root cause, impact assessment, and remediation steps.

## Air-Gapped Safety

All agents check `process.env.SIBYL_DISABLE_AI` at construction time. If set to `'true'`, the constructor throws an explicit error:

```
Error: AI features are explicitly disabled in this deployment (SIBYL_DISABLE_AI=true).
To use AI features in an air-gapped environment, provide a local LLM endpoint.
```

This is a deliberate design decision — AI features must never silently degrade in a security-sensitive environment.

## Usage

```typescript
import { SibylInvestigator } from '@sibyl/agent';

const investigator = new SibylInvestigator({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20240620',
  fetchPromises: async (projectId) => { /* ... */ },
  fetchRecentEvents: async (projectId, limit) => { /* ... */ },
});

const result = await investigator.investigate(
  'Users report being charged twice when retrying after a timeout',
  'project-123'
);
```

## Module Map

```
src/
├── index.ts       # SibylInvestigator class + re-exports
├── explainer.ts   # SibylExplainer agent
├── patcher.ts     # SibylPatcher agent
├── postmortem.ts  # SibylPostmortem agent
└── tools.ts       # Anthropic tool definitions (get_promises, get_recent_events, submit_investigation)
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | API key for Claude |
| `SIBYL_DISABLE_AI` | No | Set to `true` to disable all AI features |
| `SIBYL_LOCAL_LLM_URL` | No | Route AI through a customer-hosted endpoint |
