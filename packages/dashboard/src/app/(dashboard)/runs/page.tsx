"use client";

import * as React from "react";
import { ErrorBoundary } from "@sibyl/ui";
import { api } from "../../../lib/api";
import type { RunStatusValue } from "../../../lib/api-types";
import { useApiQuery } from "../../../hooks/useApiQuery";
import { LiveSessions } from "./components/LiveSessions";
import { RunList } from "./components/RunList";
import { RunDetail } from "./components/RunDetail";

const STATUS_FILTERS: { label: string; value: RunStatusValue | "" }[] = [
  { label: "All statuses", value: "" },
  { label: "Failed", value: "FAILED" },
  { label: "Intermittent", value: "INTERMITTENT" },
  { label: "Errored", value: "ERRORED" },
  { label: "Passed", value: "COMPLETED" },
];

const RUN_LIST_LIMIT = 100;

export default function RunExplorer() {
  const [statusFilter, setStatusFilter] = React.useState<RunStatusValue | "">("");
  const [chosenRunId, setChosenRunId] = React.useState<string | null>(null);

  const runsQuery = useApiQuery(`runs:${statusFilter}`, (signal) =>
    api.listRuns({ status: statusFilter || undefined, limit: RUN_LIST_LIMIT }, { signal }),
  );
  const runs = React.useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  // Keep the user's choice while it is still listed; otherwise fall back to the newest run.
  const selectedRunId =
    chosenRunId && runs.some((r) => r.runId === chosenRunId) ? chosenRunId : (runs[0]?.runId ?? null);

  const detailQuery = useApiQuery(selectedRunId ? `run:${selectedRunId}` : null, (signal) =>
    api.getRun(selectedRunId as string, { signal }),
  );

  const reloadRuns = runsQuery.reload;
  const handleSessionCompleted = React.useCallback(() => reloadRuns(), [reloadRuns]);

  return (
    <div className="flex flex-col h-full w-full">
      <LiveSessions onSessionCompleted={handleSessionCompleted} />

      <div className="flex flex-1 overflow-hidden p-6 gap-6 relative z-10">
        {/* Left Panel: Run List */}
        <div className="w-1/3 border border-glass-border rounded-2xl flex flex-col h-full bg-glass backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="p-5 border-b border-glass-border flex items-center justify-between gap-2 bg-white/5">
            <h2 className="font-display font-semibold text-lg text-gold drop-shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gold shadow-[0_0_8px_rgba(226,193,89,0.8)] animate-pulse" />
              Simulation Runs
            </h2>
            <label className="flex items-center gap-2 text-xs text-muted font-body">
              <span className="sr-only">Filter by status</span>
              <div className="relative">
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as RunStatusValue | "")}
                  className="appearance-none bg-ink-2/80 border border-glass-border rounded-lg pl-3 pr-8 py-1.5 text-xs text-parchment font-medium outline-none focus:border-gold hover:border-white/20 transition-colors shadow-inner"
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value || "all"} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </label>
          </div>

          <ErrorBoundary>
            <RunList
              runs={runs}
              selectedRunId={selectedRunId}
              onSelectRun={setChosenRunId}
              isLoading={runsQuery.isLoading && runsQuery.data === undefined}
              error={runsQuery.error}
              onRetry={runsQuery.reload}
              statusFilter={statusFilter || null}
            />
          </ErrorBoundary>
        </div>

        {/* Right Panel: Run Detail */}
        <div className="w-2/3 border border-glass-border rounded-2xl h-full flex flex-col bg-glass backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          <ErrorBoundary>
            {runs.length === 0 && !detailQuery.isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-muted">
                <div className="w-16 h-16 rounded-full border border-glass-border bg-white/5 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-sm font-medium">{runsQuery.isLoading ? "Simulating futures…" : "Select a run to view execution trace."}</p>
              </div>
            ) : (
              <RunDetail
                run={detailQuery.data ?? null}
                isLoading={detailQuery.isLoading}
                error={detailQuery.error}
                onRetry={detailQuery.reload}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
