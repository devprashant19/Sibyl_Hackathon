import { AuditLogger } from "./logger";
import { TIERS, PlanTier } from "../billing/tiers";

export class ComplianceReportGenerator {
  
  /**
   * Generates a markdown-formatted compliance report mapping Sibyl's current
   * configuration to standard SOC 2 Trust Services Criteria.
   */
  public static async generateReport(orgId: string, orgName: string, tier: PlanTier): Promise<string> {
    const timestamp = new Date().toISOString();
    const retentionDays = TIERS[tier].retentionDays;
    
    // Fetch a sample of recent audit logs to prove CC7.1 compliance
    const recentLogs = await AuditLogger.getLogs(orgId);
    const logSample = recentLogs.slice(0, 5).map(log => 
      `- **${log.timestamp}**: ${log.actorId} [${log.actorRole}] performed \`${log.action}\``
    ).join('\n');

    const ssoStatus = tier === 'PYTHIA' || tier === 'ORACLE' ? 'Enabled (Enforced)' : 'Disabled';

    return `
# Security & Compliance Evidence Report
**Organization**: ${orgName}
**Report Generated**: ${timestamp}
**Platform Tier**: ${tier}

This document provides exportable evidence of security controls enforced within the Sibyl Chaos Engine, mapped to standard SOC 2 criteria.

---

## 1. Logical and Physical Access Controls (CC6.1)
*The entity implements logical access security software, infrastructure, and architectures.*

- **Single Sign-On (SSO)**: ${ssoStatus}
- **Provisioning Model**: Active Directory Sync via SCIM 2.0. Deprovisioning requests immediately revoke session tokens.

## 2. Role-Based Access Control (CC6.3)
*The entity authorizes logical access to system interfaces, functions, and data.*

Sibyl enforces strict RBAC matrices at the API boundary:
- \`OWNER\`: Full administrative and billing control.
- \`ADMIN\`: User and API key management.
- \`MEMBER\`: Can edit invariants and trigger simulation runs.
- \`VIEWER\`: Read-only access to run analytics and dashboards.

## 3. System Monitoring & Audit Trails (CC7.1)
*To meet its objectives, the entity uses detection and monitoring procedures to identify changes to configurations.*

All security-relevant mutations are written to an immutable append-only audit log. 
**Recent Audit Log Sample:**
${logSample || '*No recent audit logs available.*'}

## 4. Data Retention & Lifecycle (CC6.6)
*The entity implements logical access security measures to protect against threats from external sources.*

- **Data Retention Policy**: ${retentionDays === Infinity ? 'Indefinite (Self-Hosted)' : `${retentionDays} Days`}
- **Enforcement Mechanism**: An automated background worker irreversibly purges \`captured_events\` and \`simulation_runs\` exceeding the retention window every 24 hours.
    `.trim();
  }
}
