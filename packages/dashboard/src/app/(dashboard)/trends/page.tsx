"use client";

import * as React from "react";
import { ErrorBoundary } from "@sibyl/ui";
import { api } from "../../../lib/api";
import { useApiQuery } from "../../../hooks/useApiQuery";
import { PromiseTrends } from "./components/PromiseTrends";

export default function Trends() {
  const trendsQuery = useApiQuery("promise-trends", (signal) => api.promiseTrends({}, { signal }));

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="font-display text-3xl text-gold mb-2">Promise Trends</h1>
        <p className="text-muted font-body">Fail rate of each promise, per uploaded search session.</p>
      </header>

      <ErrorBoundary>
        <PromiseTrends
          trends={trendsQuery.data ?? []}
          isLoading={trendsQuery.isLoading && trendsQuery.data === undefined}
          error={trendsQuery.error}
          onRetry={trendsQuery.reload}
        />
      </ErrorBoundary>
    </div>
  );
}
