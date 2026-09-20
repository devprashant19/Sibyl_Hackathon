import Anthropic from "@anthropic-ai/sdk";
import { BudgetManager } from "./guardrails/BudgetManager";
import { BaseAgentOptions, assertAIEnabled, callClaude, requireText } from "./common";
import { resolveModel } from "./models";

export type PatcherOptions = BaseAgentOptions;

export interface PatchResult {
  unifiedDiff: string;
  explanation: string;
  /** True when the diff was cut off (unterminated code fence or max_tokens reached). */
  truncated: boolean;
}

const PATCHER_MAX_TOKENS = 8192;
const NO_DIFF = "No diff generated.";
const NO_EXPLANATION = "No explanation provided.";

/**
 * Extracts the first ```diff (or ```patch) fenced block and the explanation after it.
 * Tolerates CRLF line endings and an unterminated fence (output truncated at max_tokens).
 */
export function parsePatchOutput(output: string, stoppedAtMaxTokens = false): PatchResult {
  const text = output.replace(/\r\n?/g, "\n");
  const open = /```(?:diff|patch)[^\S\n]*\n/.exec(text);
  if (!open) {
    return { unifiedDiff: NO_DIFF, explanation: NO_EXPLANATION, truncated: stoppedAtMaxTokens };
  }

  const bodyStart = open.index + open[0].length;
  const closeIdx = text.indexOf("```", bodyStart);
  if (closeIdx === -1) {
    const diff = text.slice(bodyStart).trim();
    return { unifiedDiff: diff || NO_DIFF, explanation: NO_EXPLANATION, truncated: true };
  }

  const diff = text.slice(bodyStart, closeIdx).trim();
  const explanation = text.slice(closeIdx + 3).trim();
  return {
    unifiedDiff: diff || NO_DIFF,
    explanation: explanation || NO_EXPLANATION,
    truncated: stoppedAtMaxTokens
  };
}

export class SibylPatcher {
  private anthropic: Anthropic;
  private model: string;
  private orgId: string;
  private budget: BudgetManager;

  constructor(options: PatcherOptions) {
    assertAIEnabled();
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = resolveModel(options.model);
    this.orgId = options.orgId || "default-org";
    this.budget = new BudgetManager(options.budgetFile);
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

    const response = await callClaude(
      { anthropic: this.anthropic, budget: this.budget, orgId: this.orgId, model: this.model },
      { max_tokens: PATCHER_MAX_TOKENS, messages: [{ role: "user", content: prompt }] }
    );
    const output = requireText(response);

    return parsePatchOutput(output, response.stop_reason === "max_tokens");
  }
}
