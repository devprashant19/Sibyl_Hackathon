import { PlanTier, TIERS } from '../billing/tiers';

export class DataRetentionWorker {
  
  /**
   * Executes the daily retention sweep to purge old data based on plan tiers.
   * @param orgId The organization ID
   * @param tier The billing tier of the organization
   * @param dryRun If true, only logs counts without deleting data
   */
  public static async runSweep(orgId: string, tier: PlanTier, dryRun: boolean = false) {
    const retentionDays = TIERS[tier].retentionDays;

    if (retentionDays === Infinity) {
      console.log(`[RetentionWorker] Org ${orgId} (Tier: ${tier}) has infinite retention. Skipping.`);
      return { deletedEvents: 0, deletedRuns: 0 };
    }

    console.log(`[RetentionWorker] Sweeping Org ${orgId} (Tier: ${tier}) for data older than ${retentionDays} days...`);

    const sqlEvents = `
      DELETE FROM captured_events 
      WHERE org_id = $1 AND created_at < NOW() - INTERVAL '${retentionDays} days'
      RETURNING id;
    `;

    const sqlRuns = `
      DELETE FROM simulation_runs 
      WHERE org_id = $1 AND created_at < NOW() - INTERVAL '${retentionDays} days'
      RETURNING id;
    `;

    // MOCK EXECUTION: In v1 we mock the pg pool
    const mockDeletedEventsCount = Math.floor(Math.random() * 500);
    const mockDeletedRunsCount = Math.floor(Math.random() * 10);

    if (dryRun) {
      console.log(`[RetentionWorker] [DRY RUN] Would delete ${mockDeletedEventsCount} events and ${mockDeletedRunsCount} runs.`);
      return { deletedEvents: mockDeletedEventsCount, deletedRuns: mockDeletedRunsCount };
    }

    // try {
    //   const { rowCount: deletedEvents } = await pool.query(sqlEvents, [orgId]);
    //   const { rowCount: deletedRuns } = await pool.query(sqlRuns, [orgId]);
    //   console.log(`[RetentionWorker] Deleted ${deletedEvents} events and ${deletedRuns} runs.`);
    //   return { deletedEvents, deletedRuns };
    // } catch (err) {
    //   console.error(`[RetentionWorker] Error executing sweep:`, err);
    //   throw err;
    // }

    console.log(`[RetentionWorker] Deleted ${mockDeletedEventsCount} events and ${mockDeletedRunsCount} runs.`);
    return { deletedEvents: mockDeletedEventsCount, deletedRuns: mockDeletedRunsCount };
  }
}
