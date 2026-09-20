import Anthropic from "@anthropic-ai/sdk";

export interface AnalyzerOptions {
  apiKey: string;
  model?: string;
}

export interface PostmortemAnalysisResult {
  draftPromises: string;
  draftTemplates: string;
  explanation: string;
}

export class SibylPostmortemAnalyzer {
  private anthropic: Anthropic;
  private model: string;

  constructor(options: AnalyzerOptions) {
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || "claude-3-5-sonnet-20240620";
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

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });

    // @ts-ignore
    const output = response.content[0].text;

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
