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
    <ul className="flex-1 overflow-y-auto divide-y divide-glass-border/50" aria-label="Simulation runs">
      {runs.map((run) => {
        const selected = selectedRunId === run.runId;
        return (
          <li key={`${run.sessionId}:${run.runId}`}>
            <button
              type="button"
              onClick={() => onSelectRun(run.runId)}
              data-testid={`run-item-${run.runId}`}
              aria-current={selected ? "true" : undefined}
              className={`group w-full text-left p-4 cursor-pointer transition-all duration-300 relative overflow-hidden ${
                selected 
                  ? "bg-gradient-to-r from-gold/10 to-transparent border-l-2 border-gold" 
                  : "hover:bg-white/5 border-l-2 border-transparent"
              }`}
            >
              {selected && <div className="absolute inset-0 bg-gradient-to-r from-gold/5 to-transparent pointer-events-none" />}
              
              <div className="relative z-10">
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className={`font-mono text-sm font-bold truncate transition-colors ${selected ? "text-gold drop-shadow-sm" : "text-parchment group-hover:text-gold/80"}`} title={run.runId}>
                    {run.runId}
                  </span>
                  <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                </div>
                <div className="flex justify-between items-center gap-2 text-[11px] text-muted font-body">
                  <span className="truncate">
                    {run.project} <span className="opacity-50 mx-1">•</span> session {shortId(run.sessionId)}
                  </span>
                  <span className="font-mono bg-black/30 shadow-inner px-1.5 py-0.5 rounded text-white/80">{formatDuration(run.durationMs)}</span>
                </div>
                <div className="flex justify-between items-center gap-2 text-[11px] text-muted font-body mt-2">
                  <span>{formatDateTimeUtc(run.createdAt)}</span>
                  {run.failedPromises.length > 0 && (
                    <span className="text-ember font-medium truncate bg-ember/10 border border-ember/20 px-1.5 py-0.5 rounded shadow-sm" title={run.failedPromises.join(", ")}>
                      ✕ {run.failedPromises.length === 1 ? run.failedPromises[0] : `${run.failedPromises.length} promises`}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
