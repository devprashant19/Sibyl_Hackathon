export class BudgetExceededError extends Error {
  constructor(
    public orgId: string,
    public currentSpend: number,
    public budgetLimit: number,
    public estimatedCost: number = 0
  ) {
    super(
      estimatedCost > 0
        ? `Budget would be exceeded for organization ${orgId}. Current spend: $${currentSpend.toFixed(4)}, estimated cost of next call: $${estimatedCost.toFixed(4)}, Limit: $${budgetLimit.toFixed(2)}.`
        : `Budget exceeded for organization ${orgId}. Current spend: $${currentSpend.toFixed(2)}, Limit: $${budgetLimit.toFixed(2)}.`
    );
    this.name = 'BudgetExceededError';
  }
}

/** The budget store file exists but cannot be parsed or has an invalid shape. Fails closed. */
export class BudgetStoreCorruptError extends Error {
  constructor(public storePath: string, public reason: string) {
    super(`Budget store at ${storePath} is corrupt (${reason}). Refusing to make AI calls until it is repaired or removed manually; spend has not been reset.`);
    this.name = 'BudgetStoreCorruptError';
  }
}

/** Transport or API failure when calling Claude (network error, 4xx/5xx status). */
export class ClaudeUnavailableError extends Error {
  public status?: number;

  constructor(public causeError: any) {
    const status = typeof causeError?.status === 'number' ? causeError.status : undefined;
    const detail = causeError instanceof Error ? causeError.message : String(causeError);
    super(`The Claude API request failed${status !== undefined ? ` (HTTP ${status})` : ''}: ${detail}`);
    this.name = 'ClaudeUnavailableError';
    this.status = status;
  }
}

/** Claude responded successfully but the response could not be used (e.g. no text content). */
export class ClaudeResponseError extends Error {
  constructor(message: string, public stopReason?: string | null) {
    super(message);
    this.name = 'ClaudeResponseError';
  }
}

/** AI features are disabled via SIBYL_DISABLE_AI. */
export class AIDisabledError extends Error {
  constructor(public envValue?: string) {
    super(`AI features are explicitly disabled in this deployment (SIBYL_DISABLE_AI=${envValue ?? 'true'}). To use AI features in an air-gapped environment, provide a local LLM endpoint.`);
    this.name = 'AIDisabledError';
  }
}

/** The investigator tool loop ran for more turns than allowed without submitting a result. */
export class AgentTurnLimitError extends Error {
  constructor(public maxTurns: number) {
    super(`Agent did not submit an investigation within ${maxTurns} turns; aborting to avoid unbounded spend.`);
    this.name = 'AgentTurnLimitError';
  }
}
