"use client";

import * as React from "react";
import { ErrorBoundary } from "@sibyl/ui";
import { PromiseTrends } from "./components/PromiseTrends";

const mockTrends = [
  { id: "1", name: "No HTTP 500s", description: "System should not return 500 errors", passRate: 94.2, totalRuns: 1402 },
  { id: "2", name: "Idempotent Orders", description: "Duplicate requests should not create duplicate DB rows", passRate: 42.1, totalRuns: 890 },
  { id: "3", name: "Graceful DB Failover", description: "Read operations should fallback to replica", passRate: 100, totalRuns: 500 },
  { id: "4", name: "Message Queue Timeout", description: "Consumer should retry dead-letter messages", passRate: 78.5, totalRuns: 1200 },
];

export default function Trends() {
  const [isLoading, setIsLoading] = React.useState(false);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl text-gold mb-2">Promise Trends</h1>
        <p className="text-muted font-body">Aggregated pass rates across all simulation runs over the last 30 days.</p>
      </header>

      <ErrorBoundary>
        <PromiseTrends 
          trends={mockTrends}
          isLoading={isLoading} 
        />
      </ErrorBoundary>
    </div>
  );
}
