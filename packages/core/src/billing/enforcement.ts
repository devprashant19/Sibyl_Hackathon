import { UsageMeter } from "./metering";
import { TIERS, PlanTier } from "./tiers";

export class PaymentRequiredError extends Error {
  public statusCode = 402;
  constructor(message: string) {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

export class BillingEnforcer {
  /**
   * Evaluates if the organization is allowed to execute more runs based on their plan limits.
   * Throws HTTP 402 if exceeded.
   */
  public static enforceRunLimits(orgId: string, currentTier: PlanTier) {
    if (UsageMeter.isSelfHosted() || currentTier === 'PYTHIA') {
      return; // Infinite limits
    }

    const usage = UsageMeter.getUsage(orgId);
    const limit = TIERS[currentTier].maxRunsPerMonth;

    if (usage.runsExecuted >= limit) {
      throw new PaymentRequiredError(
        `Your organization has exceeded the ${currentTier} plan limit of ${limit} runs per month. ` +
        `Please upgrade to the Oracle tier for unlimited runs and extended retention.`
      );
    }
  }

  /**
   * Checks the limit and records the runs in one synchronous step. Calling enforceRunLimits and
   * UsageMeter.recordRun separately let concurrent requests all pass the check before any of
   * them was recorded.
   */
  public static consumeRuns(orgId: string, currentTier: PlanTier, count: number) {
    if (!UsageMeter.isSelfHosted() && currentTier !== 'PYTHIA') {
      const usage = UsageMeter.getUsage(orgId);
      const limit = TIERS[currentTier].maxRunsPerMonth;
      if (usage.runsExecuted + count > limit) {
        throw new PaymentRequiredError(
          `Your organization has used ${usage.runsExecuted} of the ${currentTier} plan's ${limit} runs this month; ` +
          `${count} more would exceed it. Please upgrade to the Oracle tier for unlimited runs and extended retention.`
        );
      }
    }
    UsageMeter.recordRun(orgId, count);
  }

  /**
   * Evaluates if the organization can create a new project.
   */
  public static enforceProjectLimits(currentProjectCount: number, currentTier: PlanTier) {
    if (UsageMeter.isSelfHosted() || currentTier === 'PYTHIA') {
      return;
    }

    const limit = TIERS[currentTier].maxProjects;
    if (currentProjectCount >= limit) {
      throw new PaymentRequiredError(
        `The ${currentTier} plan is limited to ${limit} project. ` +
        `Upgrade to the Oracle tier to add more services ($150/service/mo).`
      );
    }
  }
}
