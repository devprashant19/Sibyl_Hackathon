"use client";

import * as React from "react";
import { Card, ProgressTrack } from "@sibyl/ui";

export default function Trends() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl text-gold mb-2">Promise Trends</h1>
        <p className="text-muted font-body">Aggregated pass rates across all simulation runs over the last 30 days.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display text-lg text-parchment mb-1">No HTTP 500s</h3>
          <p className="text-sm text-muted mb-6">System should not return 500 errors</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-mono">
              <span className="text-gold">94.2% Pass Rate</span>
              <span className="text-muted">1,402 Runs</span>
            </div>
            <ProgressTrack value={94.2} indicatorColor="gold" />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-lg text-parchment mb-1">Idempotent Orders</h3>
          <p className="text-sm text-muted mb-6">Duplicate requests should not create duplicate DB rows</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-mono">
              <span className="text-ember">42.1% Pass Rate</span>
              <span className="text-muted">890 Runs</span>
            </div>
            <ProgressTrack value={42.1} indicatorColor="ember" />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-lg text-parchment mb-1">Graceful DB Failover</h3>
          <p className="text-sm text-muted mb-6">Read operations should fallback to replica</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-mono">
              <span className="text-gold">100% Pass Rate</span>
              <span className="text-muted">500 Runs</span>
            </div>
            <ProgressTrack value={100} indicatorColor="gold" />
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-display text-lg text-parchment mb-1">Message Queue Timeout</h3>
          <p className="text-sm text-muted mb-6">Consumer should retry dead-letter messages</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-mono">
              <span className="text-violet">78.5% Pass Rate</span>
              <span className="text-muted">1,200 Runs</span>
            </div>
            <ProgressTrack value={78.5} indicatorColor="violet" />
          </div>
        </Card>
      </div>
    </div>
  );
}
