import * as React from "react";
import { Badge, Skeleton, EmptyState } from "@sibyl/ui";
import { ApiErrorState } from "../../../../components/ApiErrorState";
import type { RunListItem, RunStatusValue } from "../../../../lib/api-types";
import { formatDateTimeUtc, formatDuration, shortId } from "../../../../lib/format";

export function statusBadgeVariant(status: RunStatusValue): "pass" | "fail" | "default" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "pass";
    case "FAILED":
    case "ERRORED":
      return "fail";
    case "INTERMITTENT":
      return "default";
    default:
      return "outline";
  }
}

interface RunListProps {
  runs: RunListItem[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Active status filter, used to word the empty state. */
  statusFilter?: RunStatusValue | null;
}

export function RunList({ runs, selectedRunId, onSelectRun, isLoading, error, onRetry, statusFilter }: RunListProps) {
  if (error) {
    return (
      <div className="flex-1 p-4">
        <ApiErrorState title="Failed to load runs" error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4" aria-busy="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 border border-ink-3 rounded-md">
            <div className="flex justify-between items-start mb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex-1 p-4">
        {statusFilter ? (
          <EmptyState title={`No ${statusFilter} runs`} description="Nothing matches this filter. Clear it to see every run." />
        ) : (
          <EmptyState title="No runs yet" description="No runs yet — run `sibyl run` with SIBYL_API_URL set." />
        )}
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto" aria-label="Simulation runs">
      {runs.map((run) => {
        const selected = selectedRunId === run.runId;
        return (
          <li key={`${run.sessionId}:${run.runId}`}>
            <button
              type="button"
              onClick={() => onSelectRun(run.runId)}
              data-testid={`run-item-${run.runId}`}
              aria-current={selected ? "true" : undefined}
              className={`w-full text-left p-4 border-b border-ink-3 cursor-pointer transition-colors ${
                selected ? "bg-ink-3/50" : "hover:bg-ink-2"
              }`}
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <span className="font-mono text-sm text-parchment font-semibold truncate" title={run.runId}>
                  {run.runId}
                </span>
                <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
              </div>
              <div className="flex justify-between items-center gap-2 text-xs text-muted font-mono">
                <span className="truncate">
                  {run.project} · session {shortId(run.sessionId)}
                </span>
                <span>{formatDuration(run.durationMs)}</span>
              </div>
              <div className="flex justify-between items-center gap-2 text-xs text-muted font-mono mt-1">
                <span>{formatDateTimeUtc(run.createdAt)}</span>
                {run.failedPromises.length > 0 && (
                  <span className="text-ember truncate" title={run.failedPromises.join(", ")}>
                    ✕ {run.failedPromises.length === 1 ? run.failedPromises[0] : `${run.failedPromises.length} promises`}
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
