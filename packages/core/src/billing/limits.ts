import { searchQueue } from '../queue/setup';

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitExceededError';
  }
}

// In a real system, these limits would be fetched from Postgres based on the org's Stripe tier
const ORG_LIMITS: Record<string, { maxRunsPerSession: number; maxConcurrentSandboxes: number }> = {
  'org_free': { maxRunsPerSession: 100, maxConcurrentSandboxes: 5 },
  'org_pro': { maxRunsPerSession: 10000, maxConcurrentSandboxes: 100 },
  'org_enterprise': { maxRunsPerSession: 500000, maxConcurrentSandboxes: 500 },
};

/**
 * Validates a search session request against the organization's billing tier limits
 * before admitting the job into the queue.
 */
export async function enforceQueueAdmission(orgId: string, requestedRuns: number): Promise<void> {
  const limits = ORG_LIMITS[orgId] || ORG_LIMITS['org_free'];

  // 1. Enforce Max Runs Per Session
  if (requestedRuns > limits.maxRunsPerSession) {
    throw new LimitExceededError(
      `Your current billing tier allows a maximum of ${limits.maxRunsPerSession} runs per search session. You requested ${requestedRuns}. Please upgrade your plan.`
    );
  }

  // 2. Enforce Max Concurrent Sandboxes (Queue Depth check)
  // Prevent admission if their currently queued jobs exceed a high threshold, 
  // preventing them from spamming the redis queue even if BullMQ Grouping prevents starvation of others.
  
  // We query BullMQ for the number of jobs waiting/active for this specific group (orgId)
  // Note: BullMQ v5 getMetrics() or counting by group might require custom lua or iterating,
  // but logically this acts as the admission barrier.
  const activeJobs = await searchQueue.getJobCounts('wait', 'active');
  
  // (Stubbed logic for checking org's current total backlog)
  const currentOrgBacklog = 0; 
  if (currentOrgBacklog + requestedRuns > limits.maxRunsPerSession * 2) {
      throw new LimitExceededError(
          `You currently have too many pending jobs in the queue. Please wait for your previous search sessions to finish.`
      );
  }
}
