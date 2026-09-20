import Anthropic from "@anthropic-ai/sdk";

export interface PatcherOptions {
  apiKey: string;
  model?: string;
}

export interface PatchResult {
  unifiedDiff: string;
  explanation: string;
}

export class SibylPatcher {
  private anthropic: Anthropic;
  private model: string;

  constructor(options: PatcherOptions) {
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || "claude-3-5-sonnet-20240620";
  }

  /**
   * Generates a suggested patch for a specific file based on the root cause analysis.
   */
  public async suggestFix(
    rootCauseNarrative: string,
    fileContents: Record<string, string>
  ): Promise<PatchResult> {
    
    const prompt = `You are an expert software engineer fixing a bug discovered by a chaos engineering simulation.
You have been provided with the root cause analysis of the failure, and the raw source code of the relevant files.

Root Cause Analysis:
${rootCauseNarrative}

Source Files:
${Object.entries(fileContents).map(([path, content]) => `--- ${path} ---\n${content}\n`).join("\n")}

Your task is to provide a fix for this bug. 
You must output a unified diff inside a markdown code block (e.g. \`\`\`diff ... \`\`\`).
After the diff, provide a very brief, one-paragraph explanation of what structural changes you made.

DO NOT output conversational filler before the diff.`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });

    // @ts-ignore
    const output = response.content[0].text;
    
    const diffMatch = output.match(/```diff\n([\s\S]*?)```/);
    const unifiedDiff = diffMatch ? diffMatch[1].trim() : "No diff generated.";
    
    // Extract explanation (everything after the diff)
    const explanationStr = output.split("```diff")[1]?.split("```")[1]?.trim() || "No explanation provided.";

    return {
      unifiedDiff,
      explanation: explanationStr
    };
  }
}
