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

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Run List */}
        <div className="w-1/3 border-r border-ink-3 flex flex-col h-full bg-ink">
          <div className="p-4 border-b border-ink-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg text-gold">Simulation Runs</h2>
            <label className="flex items-center gap-2 text-xs text-muted font-mono">
              <span className="sr-only">Filter by status</span>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as RunStatusValue | "")}
                className="bg-ink-2 border border-ink-3 rounded-md px-2 py-1 text-xs text-parchment outline-none focus:border-gold"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value || "all"} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
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
        <div className="w-2/3 h-full overflow-y-auto bg-ink-2 p-8">
          <ErrorBoundary>
            {runs.length === 0 && !detailQuery.isLoading ? (
              <div className="h-full flex items-center justify-center text-muted text-sm">
                {runsQuery.isLoading ? "Loading runs…" : "Run details appear here once a run is selected."}
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
