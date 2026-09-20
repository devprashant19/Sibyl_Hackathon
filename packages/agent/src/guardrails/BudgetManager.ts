import * as fs from 'fs';
import * as path from 'path';
import { BudgetExceededError } from '../errors';

// Claude 3.5 Sonnet Pricing (Per 1k tokens)
const COST_PER_1K_INPUT = 0.003;
const COST_PER_1K_OUTPUT = 0.015;

export interface BudgetStore {
  [orgId: string]: {
    limit: number;
    currentSpend: number;
  };
}

export class BudgetManager {
  private storePath: string;
  private memoryStore: BudgetStore | null = null;

  constructor(storePath: string = path.join(process.cwd(), '.sibyl-budget.json')) {
    this.storePath = storePath;
  }

  private loadStore(): BudgetStore {
    if (this.memoryStore) return this.memoryStore;
    
    if (fs.existsSync(this.storePath)) {
      try {
        const data = fs.readFileSync(this.storePath, 'utf-8');
        this.memoryStore = JSON.parse(data);
        return this.memoryStore!;
      } catch (e) {
        // Fallback to empty store
      }
    }
    this.memoryStore = {};
    return this.memoryStore;
  }

  private saveStore() {
    if (this.memoryStore) {
      fs.writeFileSync(this.storePath, JSON.stringify(this.memoryStore, null, 2), 'utf-8');
    }
  }

  /**
   * Initializes or gets the budget for an org.
   * Default limit is $50.00
   */
  public getBudget(orgId: string): { limit: number; currentSpend: number } {
    const store = this.loadStore();
    if (!store[orgId]) {
      store[orgId] = {
        limit: 50.0, // $50 default
        currentSpend: 0
      };
      this.saveStore();
    }
    return store[orgId];
  }

  /**
   * Checks if an organization has exceeded its budget.
   * Throws BudgetExceededError if limit is reached.
   */
  public checkBudget(orgId: string): void {
    const budget = this.getBudget(orgId);
    if (budget.currentSpend >= budget.limit) {
      throw new BudgetExceededError(orgId, budget.currentSpend, budget.limit);
    }
  }

  /**
   * Records spend based on input and output tokens consumed.
   */
  public recordSpend(orgId: string, inputTokens: number, outputTokens: number): void {
    const store = this.loadStore();
    if (!store[orgId]) {
      this.getBudget(orgId);
    }
    
    const cost = (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
    store[orgId].currentSpend += cost;
    this.saveStore();
  }
}
