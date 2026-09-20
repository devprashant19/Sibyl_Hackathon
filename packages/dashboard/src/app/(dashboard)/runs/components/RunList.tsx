import * as React from "react";
import { Badge, Skeleton, EmptyState } from "@sibyl/ui";
import { AlertCircle } from "lucide-react";

interface RunListProps {
  runs: any[];
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  isLoading?: boolean;
  error?: Error;
  onRetry?: () => void;
}

export function RunList({
  runs,
  selectedRunId,
  onSelectRun,
  isLoading,
  error,
  onRetry
}: RunListProps) {
  if (error) {
    return (
      <div className="flex-1 p-4">
        <EmptyState 
          icon={<AlertCircle size={32} className="text-ember" />}
          title="Failed to load runs"
          description={error.message || "An unexpected error occurred."}
          action={
            <button 
              onClick={onRetry}
              className="px-4 py-2 bg-ink-3 hover:bg-ink-3/80 text-parchment rounded-md text-sm transition-colors"
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
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
        <EmptyState 
          title="No simulation runs yet"
          description="You haven't executed any simulation runs in this project."
          action={
            <button 
              className="px-4 py-2 bg-gold/10 text-gold hover:bg-gold/20 border border-gold/30 rounded-md text-sm transition-colors"
              onClick={() => alert('Mock: Trigger new run')}
            >
              Trigger a New Run
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => onSelectRun(run.id)}
          data-testid={`run-item-${run.id}`}
          className={`p-4 border-b border-ink-3 cursor-pointer transition-colors ${
            selectedRunId === run.id ? "bg-ink-3/50" : "hover:bg-ink-2"
          }`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="font-mono text-sm text-parchment font-semibold">{run.id}</span>
            <Badge variant={run.status === "COMPLETED" ? "pass" : "fail"}>
              {run.status}
            </Badge>
          </div>
          <div className="flex justify-between items-center text-xs text-muted">
            <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
            <span>{run.durationMs}ms</span>
          </div>
        </div>
      ))}
    </div>
  );
}
