import { AuditLogger } from "./logger";
import { TIERS, PlanTier } from "../billing/tiers";

/** What is actually configured. The report states these facts and nothing it was not told. */
export interface ComplianceControls {
  ssoEnabled: boolean;
  scimEnabled: boolean;
  /** Overrides the tier's window when the deployment sets its own. */
  retentionDays?: number;
  /** The most recent completed retention sweep, if one has run. */
  lastRetentionSweep?: { completedAt: string; deletedRuns: number; deletedEvents: number };
}

export class ComplianceReportGenerator {

  /**
   * Generates a markdown-formatted report mapping the deployment's controls to SOC 2 Trust Services
   * Criteria. It used to assert "SSO enforced", "SCIM deprovisioning revokes sessions" and "purged
   * every 24 hours" from the plan tier alone; evidence has to come from the configuration.
   */
  public static async generateReport(orgId: string, orgName: string, tier: PlanTier, controls: ComplianceControls): Promise<string> {
    const timestamp = new Date().toISOString();
    const retentionDays = controls.retentionDays ?? TIERS[tier].retentionDays;

    const recentLogs = await AuditLogger.getLogs(orgId);
    const logSample = recentLogs.slice(0, 5).map(log =>
      `- **${log.timestamp}**: ${log.actorId} [${log.actorRole}] performed \`${log.action}\``
    ).join('\n');

    const sweep = controls.lastRetentionSweep
      ? `Last sweep completed ${controls.lastRetentionSweep.completedAt}, deleting ${controls.lastRetentionSweep.deletedRuns} runs and ${controls.lastRetentionSweep.deletedEvents} events.`
      : 'No retention sweep has completed yet — there is no purge evidence for this period.';

    return `
# Security & Compliance Evidence Report
**Organization**: ${orgName}
**Report Generated**: ${timestamp}
**Platform Tier**: ${tier}

This document lists the security controls configured for this deployment, mapped to SOC 2 criteria. Items marked *Not configured* are gaps, not controls.

---

## 1. Logical and Physical Access Controls (CC6.1)

- **Single Sign-On (SSO)**: ${controls.ssoEnabled ? 'Configured' : '*Not configured*'}
- **Directory sync (SCIM 2.0)**: ${controls.scimEnabled ? 'Configured' : '*Not configured*'}

## 2. Role-Based Access Control (CC6.3)

Roles defined by the RBAC matrix:
- \`OWNER\`: Full administrative and billing control.
- \`ADMIN\`: User and API key management.
- \`MEMBER\`: Can edit invariants and trigger simulation runs.
- \`VIEWER\`: Read-only access to run analytics and dashboards.

## 3. System Monitoring & Audit Trails (CC7.1)

Security-relevant actions are recorded in the audit log.
**Recent Audit Log Sample:**
${logSample || '*No audit log entries for this organization.*'}

## 4. Data Retention & Lifecycle (CC6.6)

- **Data Retention Policy**: ${Number.isFinite(retentionDays) ? `${retentionDays} Days` : 'Indefinite'}
- **Enforcement evidence**: ${sweep}
    `.trim();
  }
}
