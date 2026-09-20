"use client";

import * as React from "react";
import { ErrorBoundary } from "@sibyl/ui";
import { api } from "../../../lib/api";
import { useApiQuery } from "../../../hooks/useApiQuery";
import { PromiseTrends } from "./components/PromiseTrends";

export default function Trends() {
  const trendsQuery = useApiQuery("promise-trends", (signal) => api.promiseTrends({}, { signal }));

  return (
    <div className="flex flex-col h-full bg-bg overflow-y-auto">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-xl text-text">System Reliability Trends</h1>
          <span className="px-2 py-0.5 rounded-md bg-green-dim text-green-bright text-[10px] font-mono border border-green/20">
            14 Services Active
          </span>
        </div>
        <div className="flex items-center gap-3">
          <select className="bg-surface-raised border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-green">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>Last 24 Hours</option>
          </select>
          <button className="px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-raised transition-colors text-sm font-semibold flex items-center gap-2 text-text">
            <span className="material-symbols-outlined text-[18px]">download</span> Export
          </button>
        </div>
      </header>

      <div className="p-6 max-w-[1400px] mx-auto w-full space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium text-text-muted">Total Simulation Runs</span>
              <span className="material-symbols-outlined text-text-dim text-[20px]">science</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-text">14,230</span>
              <span className="text-xs font-medium text-green bg-green-dim px-1.5 py-0.5 rounded mb-1">+12% MoM</span>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium text-text-muted">System Pass Rate</span>
              <span className="material-symbols-outlined text-green text-[20px]">check_circle</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-green">99.94%</span>
              <span className="text-xs font-medium text-text-muted mb-1">vs 99.90% SLA</span>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium text-text-muted">Mean Recovery Duration</span>
              <span className="material-symbols-outlined text-text-dim text-[20px]">timer</span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-text">1.2s</span>
              <span className="text-xs font-medium text-text-muted mb-1">p95</span>
            </div>
          </div>
        </div>

        <ErrorBoundary>
          <PromiseTrends
            trends={trendsQuery.data ?? []}
            isLoading={trendsQuery.isLoading && trendsQuery.data === undefined}
            error={trendsQuery.error}
            onRetry={trendsQuery.reload}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
