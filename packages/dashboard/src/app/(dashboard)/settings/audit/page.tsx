"use client";

import * as React from "react";
import { Badge, Card } from "@sibyl/ui";
// In reality, this would be fetched via tRPC/REST from `@sibyl-core`
// using AuditLogger.getLogs(orgId) and checking RBAC.hasPermission(role, 'view_audit_logs')

const mockLogs = [
  { id: "aud_92j1", time: "2026-08-31T10:00:00Z", actor: "alice@acme.inc", role: "OWNER", action: "api_key.created", resource: "key_77x2", ip: "192.168.1.1" },
  { id: "aud_92j2", time: "2026-08-31T09:15:00Z", actor: "bob@acme.inc", role: "MEMBER", action: "promise.edited", resource: "no-500s", ip: "192.168.1.4" },
  { id: "aud_92j3", time: "2026-08-30T16:30:00Z", actor: "system", role: "SYSTEM", action: "run.completed", resource: "run_88", ip: "10.0.0.1" },
  { id: "aud_92j4", time: "2026-08-28T11:20:00Z", actor: "alice@acme.inc", role: "OWNER", action: "user.invited", resource: "bob@acme.inc", ip: "192.168.1.1" }
];

export default function AuditLogsPage() {
  
  // Mocking the current user's role to demonstrate RBAC UI logic
  const currentUserRole = "OWNER";
  
  if (currentUserRole !== "OWNER" && currentUserRole !== "ADMIN") {
    return (
      <div className="flex items-center justify-center h-full w-full bg-ink text-parchment">
        <div className="text-center">
          <span className="text-4xl mb-4 block">🔒</span>
          <h2 className="text-xl font-display text-gold mb-2">Access Denied</h2>
          <p className="text-muted">You do not have permission to view Audit Logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="border-b border-ink-3 p-6 bg-ink-2 shrink-0">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-display text-2xl text-gold">Audit Logs</h1>
          <p className="text-sm text-muted mt-2">Immutable record of security and administrative events.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 bg-ink">
        <div className="max-w-5xl mx-auto">
          
          <Card className="bg-ink-2 border-ink-3 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-parchment">
                <thead className="bg-ink-3 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Timestamp (UTC)</th>
                    <th className="px-6 py-4 font-semibold">Actor</th>
                    <th className="px-6 py-4 font-semibold">Action</th>
                    <th className="px-6 py-4 font-semibold">Resource</th>
                    <th className="px-6 py-4 font-semibold">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-3">
                  {mockLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-ink-3/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-muted whitespace-nowrap">
                        {log.time.replace('T', ' ').replace('Z', '')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.actor}</span>
                          <Badge variant="pass" className="text-[10px] px-1.5 py-0 bg-gold/10 text-gold border-gold/20">
                            {log.role}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-violet">
                        {log.action}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-parchment">
                        {log.resource}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted font-mono">
                        {log.ip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
