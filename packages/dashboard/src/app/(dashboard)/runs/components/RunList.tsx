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
          <div key={i} className="p-4 border border-border rounded-md">
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
    <ul className="flex-1 overflow-y-auto divide-y divide-border" aria-label="Simulation runs">
      {runs.map((run) => {
        const selected = selectedRunId === run.runId;
        return (
          <li key={`${run.sessionId}:${run.runId}`}>
            <button
              type="button"
              onClick={() => onSelectRun(run.runId)}
              data-testid={`run-item-${run.runId}`}
              aria-current={selected ? "true" : undefined}
              className={`w-full text-left p-4 cursor-pointer transition-all relative overflow-hidden ${
                selected 
                  ? "bg-surface-raised border-l-4 border-green" 
                  : "hover:bg-surface-raised border-l-4 border-transparent"
              }`}
            >
              <article className="flex flex-col gap-1.5 relative z-10">
                {/* Row 1: ID and Badge */}
                <div className="flex justify-between items-start gap-2">
                  <span className={`font-mono text-sm font-semibold truncate ${selected ? "text-green" : "text-text"}`} title={run.runId}>
                    {run.runId}
                  </span>
                  <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                </div>
                
                {/* Row 2: Context and Duration */}
                <div className="flex justify-between items-center gap-2 text-xs text-text-muted">
                  <span className="truncate">
                    {run.project} <span className="opacity-50 mx-1">•</span> session {shortId(run.sessionId)}
                  </span>
                  <span className="font-mono bg-bg border border-border px-1.5 py-0.5 rounded text-text-muted">
                    {formatDuration(run.durationMs)}
                  </span>
                </div>
                
                {/* Row 3: Timestamp and Failed Promises */}
                <div className="flex justify-between items-center gap-2 text-xs text-text-dim mt-1">
                  <span>{formatDateTimeUtc(run.createdAt)}</span>
                  {run.failedPromises.length > 0 && (
                    <span className="text-red font-medium truncate bg-red-dim border border-red/20 px-1.5 py-0.5 rounded" title={run.failedPromises.join(", ")}>
                      ✕ {run.failedPromises.length === 1 ? run.failedPromises[0] : `${run.failedPromises.length} promises`}
                    </span>
                  )}
                </div>
              </article>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
