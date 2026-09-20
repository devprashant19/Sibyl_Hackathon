import Anthropic from "@anthropic-ai/sdk";
import { BudgetManager } from "./guardrails/BudgetManager";
import { BaseAgentOptions, assertAIEnabled, callClaude, requireText } from "./common";
import { resolveModel } from "./models";

export type AnalyzerOptions = BaseAgentOptions;

export interface PostmortemAnalysisResult {
  draftPromises: string;
  draftTemplates: string;
  explanation: string;
}

const POSTMORTEM_MAX_TOKENS = 8192;

export class SibylPostmortemAnalyzer {
  private anthropic: Anthropic;
  private model: string;
  private orgId: string;
  private budget: BudgetManager;

  constructor(options: AnalyzerOptions) {
    assertAIEnabled();
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = resolveModel(options.model);
    this.orgId = options.orgId || "default-org";
    this.budget = new BudgetManager(options.budgetFile);
  }

  /**
   * Analyzes a postmortem document and outputs drafted Sibyl invariants.
   */
  public async analyze(postmortemText: string): Promise<PostmortemAnalysisResult> {
    const prompt = `You are an expert site reliability engineer working with the Sibyl Chaos Engineering framework.
You have been provided with an incident postmortem document.
Your task is to analyze this document and generate two things to ensure this incident never happens again:

1. A "FaultScheduleTemplate" (in TypeScript) that recreates the failure conditions described.
2. A "ProgrammaticPromise" (in TypeScript) that asserts the correct system behavior.

Here is the Postmortem Document:
---
${postmortemText}
---

Output your response strictly in the following format:

### Explanation
[Brief explanation of how the drafted code prevents this incident]

### Promise
\`\`\`typescript
export const promises: ProgrammaticPromise[] = [
  // ... your drafted promise here ...
];
\`\`\`

### Template
\`\`\`typescript
export const templates: FaultScheduleTemplate[] = [
  // ... your drafted template here ...
];
\`\`\``;

    const response = await callClaude(
      { anthropic: this.anthropic, budget: this.budget, orgId: this.orgId, model: this.model },
      { max_tokens: POSTMORTEM_MAX_TOKENS, messages: [{ role: "user", content: prompt }] }
    );
    const output = requireText(response).replace(/\r\n?/g, "\n");

    // Parse the output using regex
    const explanationMatch = output.match(/### Explanation\n([\s\S]*?)\n### Promise/);
    const promiseMatch = output.match(/### Promise\n```typescript\n([\s\S]*?)```/);
    const templateMatch = output.match(/### Template\n```typescript\n([\s\S]*?)```/);

    return {
      explanation: explanationMatch ? explanationMatch[1].trim() : "Analysis complete.",
      draftPromises: promiseMatch ? promiseMatch[1].trim() : "// No promises drafted.",
      draftTemplates: templateMatch ? templateMatch[1].trim() : "// No templates drafted."
    };
  }
}
