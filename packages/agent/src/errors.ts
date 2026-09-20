export class BudgetExceededError extends Error {
  constructor(public orgId: string, public currentSpend: number, public budgetLimit: number) {
    super(`Budget exceeded for organization ${orgId}. Current spend: $${currentSpend.toFixed(2)}, Limit: $${budgetLimit.toFixed(2)}.`);
    this.name = 'BudgetExceededError';
  }
}

export class ClaudeUnavailableError extends Error {
  constructor(public causeError: any) {
    super("The Claude AI explanation couldn't be generated right now due to a network or service issue.");
    this.name = 'ClaudeUnavailableError';
  }
}
