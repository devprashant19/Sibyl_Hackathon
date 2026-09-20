"use client";

import * as React from "react";
import { Card, ProgressTrack, Badge } from "@sibyl/ui";

const MOCK_PROJECTS = [
  { name: "Checkout Service", totalRuns: 14050, mtbf: "72 hours", passRate: 98.2, trend: "up" },
  { name: "Billing API", totalRuns: 8900, mtbf: "14 hours", passRate: 92.5, trend: "down" },
  { name: "Notification Worker", totalRuns: 22000, mtbf: "120 hours", passRate: 99.8, trend: "up" },
  { name: "Inventory Sync", totalRuns: 4500, mtbf: "2 hours", passRate: 64.1, trend: "down" },
];

export default function Analytics() {
  const orgPassRate = 88.6; // Aggregate mock

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="font-display text-4xl text-gold mb-2">Organization Health</h1>
          <p className="text-muted font-body">Cross-project reliability metrics (Last 30 days)</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted font-mono mb-1">AGGREGATE PASS RATE</div>
          <div className={`text-4xl font-display ${orgPassRate > 90 ? 'text-gold' : 'text-ember'}`}>
            {orgPassRate}%
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {MOCK_PROJECTS.map(p => (
          <Card key={p.name} className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-display text-xl text-parchment flex items-center">
                  {p.name}
                  {p.passRate < 80 && <Badge variant="fail" className="ml-3">Needs Attention</Badge>}
                </h3>
                <span className="text-sm text-muted font-mono">{p.totalRuns.toLocaleString()} simulation runs</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono text-parchment">{p.passRate}%</div>
                <div className={`text-xs font-semibold ${p.trend === 'up' ? 'text-gold' : 'text-ember'}`}>
                  {p.trend === 'up' ? '↑ Improving' : '↓ Degrading'}
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-mono text-muted">
                <span>Reliability</span>
                <span>{p.passRate}%</span>
              </div>
              <ProgressTrack 
                value={p.passRate} 
                indicatorColor={p.passRate > 95 ? "gold" : p.passRate > 80 ? "violet" : "ember"} 
              />
            </div>

            <div className="pt-4 border-t border-ink-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted font-mono mb-1">MTBF</div>
                <div className="text-sm text-parchment">{p.mtbf}</div>
              </div>
              <div>
                <div className="text-xs text-muted font-mono mb-1">Top Failing Promise</div>
                <div className="text-sm text-ember truncate">Idempotency_Violation</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
