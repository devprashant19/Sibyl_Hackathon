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
  { label: "All Status", value: "" },
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Run List */}
        <div className="w-80 border-r border-border flex flex-col h-full bg-surface">
          <div className="p-4 border-b border-border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg text-text flex items-center gap-2">
                Execution Feed
                <span className="px-2 py-0.5 rounded-full bg-surface-raised border border-border text-xs font-mono text-text-muted">
                  {runs.length}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={reloadRuns} className="p-1 rounded hover:bg-surface-raised text-text-muted transition-colors" title="Refresh">
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                </button>
                <button className="p-1 rounded hover:bg-surface-raised text-text-muted transition-colors" title="Filter">
                  <span className="material-symbols-outlined text-[18px]">filter_list</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as RunStatusValue | "")}
                  className="w-full appearance-none bg-surface-raised border border-border rounded-md pl-2 pr-6 py-1 text-xs text-text focus:outline-none focus:border-green transition-colors"
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value || "all"} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted text-[14px]">arrow_drop_down</span>
              </div>
              <div className="relative">
                <select className="w-full appearance-none bg-surface-raised border border-border rounded-md pl-2 pr-6 py-1 text-xs text-text focus:outline-none focus:border-green transition-colors">
                  <option>Newest First</option>
                  <option>Oldest First</option>
                </select>
                <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted text-[14px]">arrow_drop_down</span>
              </div>
            </div>
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
        <div className="flex-1 h-full flex flex-col bg-bg overflow-hidden relative">
          <ErrorBoundary>
            {runs.length === 0 && !detailQuery.isLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
                <div className="w-16 h-16 rounded-2xl border border-border bg-surface flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[32px] text-text-dim">terminal</span>
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
