"use client";

import * as React from "react";
import { Card } from "@sibyl/ui";

export default function CompliancePage() {
  
  // Mocking the current user's role to demonstrate RBAC UI logic
  const currentUserRole = "OWNER";
  
  if (currentUserRole !== "OWNER" && currentUserRole !== "ADMIN") {
    return (
      <div className="flex items-center justify-center h-full w-full bg-ink text-parchment">
        <div className="text-center">
          <span className="text-4xl mb-4 block">🔒</span>
          <h2 className="text-xl font-display text-gold mb-2">Access Denied</h2>
          <p className="text-muted">You do not have permission to view Compliance Reports.</p>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    // In production, this would hit GET /api/v1/compliance/report
    // which calls ComplianceReportGenerator.generateReport() and returns a file blob.
    
    const mockReport = `# Security & Compliance Evidence Report
**Organization**: Acme Corp
**Report Generated**: ${new Date().toISOString()}

## 1. Logical and Physical Access Controls (CC6.1)
- **Single Sign-On (SSO)**: Enabled (Enforced)
- **Provisioning Model**: Active Directory Sync via SCIM 2.0.

## 2. Role-Based Access Control (CC6.3)
Enforces strict RBAC matrices (OWNER, ADMIN, MEMBER, VIEWER).

## 3. System Monitoring & Audit Trails (CC7.1)
All security-relevant mutations are written to an immutable append-only audit log.

## 4. Data Retention & Lifecycle (CC6.6)
- **Data Retention Policy**: 30 Days (Oracle Tier)
`;

    const blob = new Blob([mockReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sibyl-compliance-report-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="border-b border-ink-3 p-6 bg-ink-2 shrink-0">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-display text-2xl text-gold">Security & Compliance</h1>
          <p className="text-sm text-muted mt-2">Export auditor-ready evidence of your security posture to unblock infosec reviews.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-ink">
        <div className="max-w-5xl mx-auto grid gap-6 grid-cols-1 md:grid-cols-2">
          
          <Card className="bg-ink-2 border-ink-3 p-6">
            <h2 className="text-lg font-display text-parchment mb-4">Security Posture Scorecard</h2>
            <ul className="space-y-4 text-sm text-muted">
              <li className="flex justify-between items-center">
                <span>SSO Enforcement</span>
                <span className="text-gold">Active ✅</span>
              </li>
              <li className="flex justify-between items-center">
                <span>SCIM Directory Sync</span>
                <span className="text-gold">Active ✅</span>
              </li>
              <li className="flex justify-between items-center">
                <span>Immutable Audit Logging</span>
                <span className="text-gold">Active ✅</span>
              </li>
              <li className="flex justify-between items-center">
                <span>Data Retention Policy</span>
                <span className="text-violet">30 Days</span>
              </li>
            </ul>
          </Card>

          <Card className="bg-ink-2 border-gold/20 p-6 flex flex-col justify-center items-center text-center">
            <h2 className="text-lg font-display text-gold mb-2">SOC 2 Evidence Report</h2>
            <p className="text-sm text-muted mb-6">
              Generates a comprehensive Markdown document mapping your current configuration to SOC 2 Trust Services Criteria (CC6.1, CC6.3, CC6.6, CC7.1).
            </p>
            <button onClick={handleDownload} className="w-full py-2 rounded bg-gold text-ink hover:bg-gold/90 font-bold transition-colors">
              Download Report (.md)
            </button>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
