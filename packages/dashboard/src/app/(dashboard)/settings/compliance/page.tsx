"use client";

import * as React from "react";
import { Button, Card } from "@sibyl/ui";
import { PreviewBanner } from "../../../../components/PreviewBanner";

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

  return (
    <div className="flex flex-col h-full w-full">
      <PreviewBanner detail="Posture values below are examples; no report is generated." />
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
            <Button variant="primary" disabled className="w-full" title="Not available in this preview">
              Download Report (not available yet)
            </Button>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
