import Anthropic from "@anthropic-ai/sdk";
import { getPromisesTool, getRecentEventsTool, submitInvestigationTool } from "./tools";
import { CacheManager } from "./guardrails/CacheManager";
import { BudgetManager } from "./guardrails/BudgetManager";
import { ClaudeUnavailableError } from "./errors";

export * from "./explainer";
export * from "./patcher";
export * from "./postmortem";
export * from "./errors";

export interface InvestigatorOptions {
  apiKey: string;
  model?: string;
  orgId?: string;
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

export class SibylInvestigator {
  private anthropic: Anthropic;
  private model: string;
  private orgId: string;
  private cache: CacheManager;
  private budget: BudgetManager;
  private fetchPromises: (projectId: string) => Promise<any>;
  private fetchRecentEvents: (projectId: string, limit: number) => Promise<any>;

  constructor(options: InvestigatorOptions) {
    if (process.env.SIBYL_DISABLE_AI === 'true') {
      throw new Error("AI features are explicitly disabled in this deployment (SIBYL_DISABLE_AI=true). To use AI features in an air-gapped environment, provide a local LLM endpoint.");
    }
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || "claude-3-5-sonnet-20240620";
    this.orgId = options.orgId || "default-org";
    this.cache = new CacheManager();
    this.budget = new BudgetManager();
    this.fetchPromises = options.fetchPromises;
    this.fetchRecentEvents = options.fetchRecentEvents;
  }

  public async investigate(bugReport: string, projectId: string): Promise<InvestigationResult> {
    const cacheKey = this.cache.generateKey('investigate', bugReport, projectId);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `You are the Sibyl AI Investigator. A user has reported the following bug:\n\n"${bugReport}"\n\nYour task is to generate a concrete FaultSchedule template to reproduce this bug via fault injection. Use 'get_promises' to see what invariants we already check, and 'get_recent_events' to see actual system telemetry (e.g., real HTTP endpoints, DB tables) so you don't hallucinate targets. Once ready, call 'submit_investigation'. If the bug is too vague, call 'submit_investigation' with a clarifying question instead.`
      }
    ];

    while (true) {
      this.budget.checkBudget(this.orgId);
      let response;
      try {
        response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: 2000,
          messages,
          tools: [getPromisesTool, getRecentEventsTool, submitInvestigationTool],
          tool_choice: { type: "auto" }
        });
        
        this.budget.recordSpend(
          this.orgId, 
          response.usage.input_tokens, 
          response.usage.output_tokens
        );
      } catch (err: any) {
        throw new ClaudeUnavailableError(err);
      }

      messages.push({ role: "assistant", content: response.content });

      const toolCalls = response.content.filter(block => block.type === "tool_use") as Anthropic.ToolUseBlock[];
      
      if (toolCalls.length === 0) {
        throw new Error("Agent failed to call submit_investigation tool.");
      }

      for (const toolCall of toolCalls) {
        if (toolCall.name === "get_promises") {
          const promises = await this.fetchPromises(projectId);
          messages.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify(promises) }]
          });
        } else if (toolCall.name === "get_recent_events") {
          const args = toolCall.input as { limit: number };
          const events = await this.fetchRecentEvents(projectId, args.limit);
          messages.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify(events) }]
          });
        } else if (toolCall.name === "submit_investigation") {
          const output = toolCall.input as any;
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
        }
      }
    }
  }
}
