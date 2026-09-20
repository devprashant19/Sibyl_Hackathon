export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitExceededError';
  }
}

export interface OrgQueueLimits {
  maxRunsPerSession: number;
  /** Runs this org may have waiting or active at once, across all its sessions. */
  maxQueuedRuns: number;
}

// In a real system, these limits would be fetched from Postgres based on the org's Stripe tier
const ORG_LIMITS: Record<string, OrgQueueLimits> = {
  'org_free': { maxRunsPerSession: 100, maxQueuedRuns: 200 },
  'org_pro': { maxRunsPerSession: 10000, maxQueuedRuns: 20000 },
  'org_enterprise': { maxRunsPerSession: 500000, maxQueuedRuns: 1000000 },
};

/**
 * Validates a search session request against the organization's limits before admitting it.
 *
 * `countQueuedRuns` reports the org's current backlog (waiting + active). It is injected rather than
 * read from a module-level BullMQ queue, which opened a Redis connection as soon as anything
 * imported @sibyl/core. The backlog check previously compared against a hard-coded 0, so it could
 * never reject anything.
 */
export async function enforceQueueAdmission(
  orgId: string,
  requestedRuns: number,
  countQueuedRuns: (orgId: string) => Promise<number>
): Promise<void> {
  const limits = ORG_LIMITS[orgId] || ORG_LIMITS['org_free'];

  if (requestedRuns > limits.maxRunsPerSession) {
    throw new LimitExceededError(
      `Your current billing tier allows a maximum of ${limits.maxRunsPerSession} runs per search session. You requested ${requestedRuns}. Please upgrade your plan.`
    );
  }

  const backlog = await countQueuedRuns(orgId);
  if (backlog + requestedRuns > limits.maxQueuedRuns) {
    throw new LimitExceededError(
      `You have ${backlog} runs pending; admitting ${requestedRuns} more would exceed your limit of ${limits.maxQueuedRuns}. Please wait for your previous search sessions to finish.`
    );
  }
}
