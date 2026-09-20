import Anthropic from "@anthropic-ai/sdk";
import { BudgetManager } from "./guardrails/BudgetManager";
import { ClaudeUnavailableError } from "./errors";

export interface PatcherOptions {
  apiKey: string;
  model?: string;
  orgId?: string;
}

export interface PatchResult {
  unifiedDiff: string;
  explanation: string;
}

export class SibylPatcher {
  private anthropic: Anthropic;
  private model: string;
  private orgId: string;
  private budget: BudgetManager;

  constructor(options: PatcherOptions) {
    if (process.env.SIBYL_DISABLE_AI === 'true') {
      throw new Error("AI features are explicitly disabled in this deployment (SIBYL_DISABLE_AI=true). To use AI features in an air-gapped environment, provide a local LLM endpoint.");
    }
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || "claude-3-5-sonnet-20240620";
    this.orgId = options.orgId || "default-org";
    this.budget = new BudgetManager();
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

    this.budget.checkBudget(this.orgId);

    let output;
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      });

      this.budget.recordSpend(
        this.orgId, 
        response.usage.input_tokens, 
        response.usage.output_tokens
      );

      // @ts-ignore
      output = response.content[0].text;
    } catch (err: any) {
      throw new ClaudeUnavailableError(err);
    }
    
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
