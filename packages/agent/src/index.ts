import Anthropic from "@anthropic-ai/sdk";
import { getPromisesTool, getRecentEventsTool, submitInvestigationTool } from "./tools";
import { CacheManager } from "./guardrails/CacheManager";
import { BudgetManager } from "./guardrails/BudgetManager";
import { AgentTurnLimitError, ClaudeResponseError } from "./errors";
import { BaseAgentOptions, assertAIEnabled, callClaude } from "./common";
import { resolveModel } from "./models";

export * from "./explainer";
export * from "./patcher";
export * from "./postmortem";
export * from "./errors";
export { DEFAULT_MODEL, MODEL_PRICING, FALLBACK_MODEL_PRICE, getModelPrice, resolveModel } from "./models";
export type { ModelPrice } from "./models";
export { isAIDisabled, isTruthyEnv, extractText } from "./common";
export type { BaseAgentOptions } from "./common";

export const DEFAULT_MAX_TURNS = 8;
export const RECENT_EVENTS_MIN_LIMIT = 1;
export const RECENT_EVENTS_MAX_LIMIT = 500;
export const RECENT_EVENTS_DEFAULT_LIMIT = 100;

const INVESTIGATOR_MAX_TOKENS = 4096;

export interface InvestigatorOptions extends BaseAgentOptions {
  /** Maximum model turns before giving up with AgentTurnLimitError. Defaults to DEFAULT_MAX_TURNS. */
  maxTurns?: number;
  // Hooks for the tools to fetch real data
  fetchPromises: (projectId: string) => Promise<any>;
  fetchRecentEvents: (projectId: string, limit: number) => Promise<any>;
}

export interface InvestigationResult {
  status: 'SUCCESS' | 'NEEDS_CLARIFICATION';
  reasoning: string;
  faultSchedule?: any;
  existingPromiseName?: string;
  draftNewPromiseCode?: string;
  clarifyingQuestion?: string;
}

/** Clamps a model-supplied event limit to [RECENT_EVENTS_MIN_LIMIT, RECENT_EVENTS_MAX_LIMIT]. */
export function clampRecentEventsLimit(limit: unknown): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n)) return RECENT_EVENTS_DEFAULT_LIMIT;
  return Math.min(RECENT_EVENTS_MAX_LIMIT, Math.max(RECENT_EVENTS_MIN_LIMIT, Math.floor(n)));
}

export class SibylInvestigator {
  private anthropic: Anthropic;
  private model: string;
  private orgId: string;
  private maxTurns: number;
  private cache: CacheManager;
  private budget: BudgetManager;
  private fetchPromises: (projectId: string) => Promise<any>;
  private fetchRecentEvents: (projectId: string, limit: number) => Promise<any>;

  constructor(options: InvestigatorOptions) {
    assertAIEnabled();
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = resolveModel(options.model);
    this.orgId = options.orgId || "default-org";
    this.maxTurns = options.maxTurns && options.maxTurns > 0 ? Math.floor(options.maxTurns) : DEFAULT_MAX_TURNS;
    this.cache = new CacheManager(options.cacheDir);
    this.budget = new BudgetManager(options.budgetFile);
    this.fetchPromises = options.fetchPromises;
    this.fetchRecentEvents = options.fetchRecentEvents;
  }

  public async investigate(bugReport: string, projectId: string): Promise<InvestigationResult> {
    const cacheKey = this.cache.generateKey(
      { agent: 'investigator.investigate', model: this.model, orgId: this.orgId },
      bugReport,
      projectId
    );
    const cached = this.cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.status === 'SUCCESS' || parsed.status === 'NEEDS_CLARIFICATION')) {
          return parsed as InvestigationResult;
        }
      } catch {
        // malformed cached value: treat as a miss
      }
    }

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `You are the Sibyl AI Investigator. A user has reported the following bug:\n\n"${bugReport}"\n\nYour task is to generate a concrete FaultSchedule template to reproduce this bug via fault injection. Use 'get_promises' to see what invariants we already check, and 'get_recent_events' to see actual system telemetry (e.g., real HTTP endpoints, DB tables) so you don't hallucinate targets. Once ready, call 'submit_investigation'. If the bug is too vague, call 'submit_investigation' with a clarifying question instead.`
      }
    ];

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const response = await callClaude(
        { anthropic: this.anthropic, budget: this.budget, orgId: this.orgId, model: this.model },
        {
          max_tokens: INVESTIGATOR_MAX_TOKENS,
          messages,
          tools: [getPromisesTool, getRecentEventsTool, submitInvestigationTool],
          tool_choice: { type: "auto" }
        }
      );

      messages.push({ role: "assistant", content: response.content });

      const toolCalls = response.content.filter(block => block.type === "tool_use") as Anthropic.ToolUseBlock[];

      if (toolCalls.length === 0) {
        throw new ClaudeResponseError(
          `Agent failed to call submit_investigation tool (stop_reason=${response.stop_reason ?? "unknown"}).`,
          response.stop_reason
        );
      }

      // Every tool_use must get a tool_result, all in a single user message.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolCall of toolCalls) {
        if (toolCall.name === "get_promises") {
          const promises = await this.fetchPromises(projectId);
          toolResults.push({ type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify(promises) });
        } else if (toolCall.name === "get_recent_events") {
          const args = (toolCall.input ?? {}) as { limit?: unknown };
          const events = await this.fetchRecentEvents(projectId, clampRecentEventsLimit(args.limit));
          toolResults.push({ type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify(events) });
        } else if (toolCall.name === "submit_investigation") {
          const output = (toolCall.input ?? {}) as any;
          let result: InvestigationResult;
          if (output.clarifyingQuestion) {
            result = {
              status: 'NEEDS_CLARIFICATION',
              reasoning: output.reasoning,
              clarifyingQuestion: output.clarifyingQuestion
            };
          } else {
            result = {
              status: 'SUCCESS',
              reasoning: output.reasoning,
              faultSchedule: output.faultSchedule,
              existingPromiseName: output.existingPromiseName,
              draftNewPromiseCode: output.draftNewPromiseCode
            };
          }
          this.cache.set(cacheKey, JSON.stringify(result));
          return result;
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            is_error: true,
            content: `Unknown tool "${toolCall.name}". Available tools: get_promises, get_recent_events, submit_investigation.`
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }

    throw new AgentTurnLimitError(this.maxTurns);
  }
}
