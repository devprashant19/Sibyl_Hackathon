import Anthropic from "@anthropic-ai/sdk";
import { BudgetManager } from "./guardrails/BudgetManager";
import { AIDisabledError, ClaudeResponseError, ClaudeUnavailableError } from "./errors";

/** Options shared by every Sibyl agent. */
export interface BaseAgentOptions {
  apiKey: string;
  /** Model ID. Defaults to SIBYL_AGENT_MODEL, then DEFAULT_MODEL. */
  model?: string;
  orgId?: string;
  /** Response cache directory. Defaults to SIBYL_AGENT_CACHE_DIR, then ~/.sibyl/agent-cache. */
  cacheDir?: string;
  /** Budget store file. Defaults to SIBYL_AGENT_BUDGET_FILE, then ~/.sibyl/agent-budget.json. */
  budgetFile?: string;
}

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on", "y"]);

/** Parses a boolean-ish environment value ("1", "true", "YES", "on", ...), case-insensitively. */
export function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_VALUES.has(value.trim().toLowerCase());
}

export function isAIDisabled(): boolean {
  return isTruthyEnv(process.env.SIBYL_DISABLE_AI);
}

/** Throws AIDisabledError when SIBYL_DISABLE_AI is set to a truthy value. */
export function assertAIEnabled(): void {
  if (isAIDisabled()) {
    throw new AIDisabledError(process.env.SIBYL_DISABLE_AI);
  }
}

/** Concatenates all text blocks of a response, ignoring tool_use, thinking and other block types. */
export function extractText(content: ReadonlyArray<{ type: string }> | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } =>
      block?.type === "text" && typeof (block as { text?: unknown }).text === "string")
    .map(block => block.text)
    .join("");
}

/** Like extractText, but throws ClaudeResponseError when the response carries no text. */
export function requireText(response: Anthropic.Message): string {
  const text = extractText(response.content);
  if (!text.trim()) {
    throw new ClaudeResponseError(
      `Claude returned no text content (stop_reason=${response.stop_reason ?? "unknown"}).`,
      response.stop_reason
    );
  }
  return text;
}

export interface ClaudeCallContext {
  anthropic: Anthropic;
  budget: BudgetManager;
  orgId: string;
  model: string;
}

/**
 * Makes one Messages API call with budget enforcement:
 * pre-call estimate check (max_tokens + input size), then spend recording.
 * Only transport/API failures are wrapped in ClaudeUnavailableError.
 */
export async function callClaude(
  ctx: ClaudeCallContext,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">
): Promise<Anthropic.Message> {
  ctx.budget.checkBudget(ctx.orgId, {
    model: ctx.model,
    maxOutputTokens: params.max_tokens,
    inputChars: JSON.stringify({ system: params.system, messages: params.messages, tools: params.tools }).length,
  });

  let response: Anthropic.Message;
  try {
    response = await ctx.anthropic.messages.create({ ...params, model: ctx.model });
  } catch (err: unknown) {
    throw new ClaudeUnavailableError(err);
  }

  ctx.budget.recordSpend(
    ctx.orgId,
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
    ctx.model
  );
  return response;
}
