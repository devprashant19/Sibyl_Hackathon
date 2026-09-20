import { PlanTier } from "./tiers";

// In a real app, this would be a Redis counter or DB table per org
interface OrgUsage {
  runsExecuted: number;
  storageBytes: number;
}

const usageStore = new Map<string, OrgUsage>();

export class UsageMeter {
  public static isSelfHosted(): boolean {
    return process.env.SIBYL_ENTERPRISE_SELF_HOSTED === 'true';
  }

  public static getUsage(orgId: string): OrgUsage {
    if (!usageStore.has(orgId)) {
      usageStore.set(orgId, { runsExecuted: 0, storageBytes: 0 });
    }
    return usageStore.get(orgId)!;
  }

  public static recordRun(orgId: string, count: number = 1) {
    if (this.isSelfHosted()) return; // Bypass metering entirely for Pythia deployments
    
    const usage = this.getUsage(orgId);
    usage.runsExecuted += count;
    usageStore.set(orgId, usage);
  }

  public static recordStorage(orgId: string, bytes: number) {
    if (this.isSelfHosted()) return;
    
    const usage = this.getUsage(orgId);
    usage.storageBytes += bytes;
    usageStore.set(orgId, usage);
  }
}
