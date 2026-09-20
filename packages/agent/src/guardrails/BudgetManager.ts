import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BudgetExceededError, BudgetStoreCorruptError } from '../errors';
import { getModelPrice } from '../models';
import { writeFileAtomic } from './atomicWrite';

export const DEFAULT_BUDGET_LIMIT_USD = 50.0;

export interface BudgetStore {
  [orgId: string]: {
    limit: number;
    currentSpend: number;
  };
}

export interface BudgetManagerOptions {
  /** Path of the JSON budget store. Defaults to SIBYL_AGENT_BUDGET_FILE, then ~/.sibyl/agent-budget.json. */
  storePath?: string;
  /** Limit (USD) applied to orgs with no entry in the store. */
  defaultLimit?: number;
}

export interface CallEstimate {
  model: string;
  /** max_tokens of the request: upper bound on billed output tokens. */
  maxOutputTokens: number;
  /** Serialized request size; used as a conservative upper bound of 1 token per character. */
  inputChars?: number;
}

export function defaultBudgetFile(): string {
  const fromEnv = process.env.SIBYL_AGENT_BUDGET_FILE?.trim();
  return fromEnv || path.join(os.homedir(), '.sibyl', 'agent-budget.json');
}

/** Cost in USD for a number of input/output tokens on a model (unknown models use the most expensive known price). */
export function computeCost(model: string | undefined, inputTokens: number, outputTokens: number): number {
  const price = getModelPrice(model);
  return (inputTokens / 1_000_000) * price.inputPerMTok + (outputTokens / 1_000_000) * price.outputPerMTok;
}

/**
 * Persists per-org AI spend. The file is the source of truth: every read
 * goes to disk and every record is a read-modify-write with an atomic
 * replace, so separate instances do not overwrite each other's spend.
 * (No cross-process lock: truly simultaneous records can still race.)
 */
export class BudgetManager {
  private storePath: string;
  private defaultLimit: number;

  constructor(storePathOrOptions?: string | BudgetManagerOptions) {
    const options: BudgetManagerOptions =
      typeof storePathOrOptions === 'string' ? { storePath: storePathOrOptions } : storePathOrOptions ?? {};
    this.storePath = options.storePath || defaultBudgetFile();
    this.defaultLimit = options.defaultLimit ?? DEFAULT_BUDGET_LIMIT_USD;
  }

  public getStorePath(): string {
    return this.storePath;
  }

  private loadStore(): BudgetStore {
    let data: string;
    try {
      data = fs.readFileSync(this.storePath, 'utf-8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') return {};
      throw new BudgetStoreCorruptError(this.storePath, `unreadable: ${err?.message ?? String(err)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err: any) {
      throw new BudgetStoreCorruptError(this.storePath, `invalid JSON: ${err?.message ?? String(err)}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BudgetStoreCorruptError(this.storePath, 'top-level value is not an object');
    }
    for (const [orgId, entry] of Object.entries(parsed as Record<string, any>)) {
      if (
        !entry || typeof entry !== 'object' ||
        typeof entry.limit !== 'number' || !Number.isFinite(entry.limit) ||
        typeof entry.currentSpend !== 'number' || !Number.isFinite(entry.currentSpend)
      ) {
        throw new BudgetStoreCorruptError(this.storePath, `invalid entry for org "${orgId}"`);
      }
    }
    return parsed as BudgetStore;
  }

  /**
   * Gets the budget for an org (default limit if the org has no entry yet).
   * Does not write to disk.
   */
  public getBudget(orgId: string): { limit: number; currentSpend: number } {
    const store = this.loadStore();
    const entry = store[orgId];
    return entry ? { ...entry } : { limit: this.defaultLimit, currentSpend: 0 };
  }

  /**
   * Throws BudgetExceededError if the org has reached its limit or, when an
   * estimate is supplied, if the worst-case cost of the next call would take
   * spend past the limit.
   */
  public checkBudget(orgId: string, estimate?: CallEstimate): void {
    const budget = this.getBudget(orgId);
    if (budget.currentSpend >= budget.limit) {
      throw new BudgetExceededError(orgId, budget.currentSpend, budget.limit);
    }
    if (estimate) {
      const estimatedCost = computeCost(estimate.model, estimate.inputChars ?? 0, estimate.maxOutputTokens);
      if (budget.currentSpend + estimatedCost > budget.limit) {
        throw new BudgetExceededError(orgId, budget.currentSpend, budget.limit, estimatedCost);
      }
    }
  }

  /**
   * Records spend for tokens consumed. Re-reads the store so spend recorded
   * by other instances is preserved.
   */
  public recordSpend(orgId: string, inputTokens: number, outputTokens: number, model?: string): void {
    const store = this.loadStore();
    const entry = store[orgId] ?? { limit: this.defaultLimit, currentSpend: 0 };
    entry.currentSpend += computeCost(model, inputTokens, outputTokens);
    store[orgId] = entry;
    writeFileAtomic(this.storePath, JSON.stringify(store, null, 2));
  }
}
