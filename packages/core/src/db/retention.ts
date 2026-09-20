import { PlanTier, TIERS } from '../billing/tiers';

/** Where retained data lives. The API's session store implements this. */
export interface RetentionStore {
  /** Deletes every run (and its events) created before `cutoffMs` for the org. Returns counts. */
  deleteOlderThan(orgId: string, cutoffMs: number): Promise<{ deletedRuns: number; deletedEvents: number }>;
  /** Counts what deleteOlderThan would delete, without deleting it. */
  countOlderThan(orgId: string, cutoffMs: number): Promise<{ deletedRuns: number; deletedEvents: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class DataRetentionWorker {
  /**
   * Purges data older than the retention window. The counts returned are what the store actually
   * deleted — this used to return Math.random() counts without deleting anything, which the
   * compliance report then cited as evidence of purging.
   *
   * @param retentionDays Overrides the tier's window (self-hosted deployments set their own).
   */
  public static async runSweep(
    store: RetentionStore,
    orgId: string,
    tier: PlanTier,
    options: { dryRun?: boolean; retentionDays?: number; now?: number } = {}
  ) {
    const retentionDays = options.retentionDays ?? TIERS[tier].retentionDays;
    if (!Number.isFinite(retentionDays)) {
      return { deletedEvents: 0, deletedRuns: 0, cutoffMs: null as number | null };
    }
    if (retentionDays <= 0) {
      throw new Error(`retentionDays must be positive, got ${retentionDays}`);
    }

    const cutoffMs = (options.now ?? Date.now()) - retentionDays * DAY_MS;
    const counts = options.dryRun
      ? await store.countOlderThan(orgId, cutoffMs)
      : await store.deleteOlderThan(orgId, cutoffMs);
    return { ...counts, cutoffMs };
  }
}
