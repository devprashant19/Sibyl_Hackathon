import * as React from "react";
import { Badge, CodeBlock, Skeleton, EmptyState } from "@sibyl/ui";
import { ApiErrorState } from "../../../../components/ApiErrorState";
import type { PromiseDescriptor, PromiseResult, RunDetail as RunDetailData } from "../../../../lib/api-types";
import {
  formatDateTimeUtc,
  formatDuration,
  formatTimeUtc,
  scheduleDelayMs,
  scheduleDetails,
  summarizeEvent,
} from "../../../../lib/format";
import { statusBadgeVariant } from "./RunList";

interface RunDetailProps {
  run: RunDetailData | null;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

function PromiseResults({ results, descriptors }: { results: PromiseResult[]; descriptors: PromiseDescriptor[] }) {
  const byId = new Map(descriptors.map((d) => [d.id, d]));
  const sorted = [...results].sort((a, b) => Number(a.passed) - Number(b.passed));

  if (sorted.length === 0) {
    return <p className="text-sm text-text-muted">No promise results were reported for this run.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sorted.map((result) => {
        const descriptor = byId.get(result.promiseId);
        return (
          <div
            key={`${result.promiseId}:${result.simulationRunId}`}
            className="rounded-xl border border-border bg-surface p-4 flex flex-col hover:border-text-dim transition-colors"
            data-testid={`promise-${result.promiseId}`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[20px] ${result.passed ? "text-green" : "text-red"}`}>
                  {result.passed ? "check_circle" : "cancel"}
                </span>
                <span className="font-semibold text-text">{result.promiseId}</span>
              </div>
              <Badge variant={result.passed ? "pass" : "fail"}>{result.passed ? "PASS" : "FAIL"}</Badge>
            </div>
            {descriptor?.description && <p className="text-sm text-text-muted mb-4 flex-1">{descriptor.description}</p>}
            
            <div className="bg-surface-raised border border-border p-3 rounded-lg text-xs font-mono">
              <div className="flex justify-between mb-1">
                <span className="text-text-muted">Observed Value</span>
                <span className={result.passed ? "text-text" : "text-red"}>{result.actualValue !== undefined ? String(result.actualValue) : "unknown"}</span>
              </div>
              {result.message && (
                <div className={`mt-2 pt-2 border-t border-border ${result.passed ? "text-text-muted" : "text-red"}`}>
                  {result.message}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RunDetail({ run, isLoading, error, onRetry }: RunDetailProps) {
  const [activeTab, setActiveTab] = React.useState<"replay" | "promises" | "schedule" | "timeline">("promises");

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-bg">
        <ApiErrorState title="Failed to load run details" error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-8 bg-bg h-full">
        <header className="flex justify-between items-start mb-8">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </header>
        <div className="flex gap-4">
          <Skeleton className="h-24 w-1/4 rounded-xl" />
          <Skeleton className="h-24 w-1/4 rounded-xl" />
          <Skeleton className="h-24 w-1/4 rounded-xl" />
          <Skeleton className="h-24 w-1/4 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-bg">
        <EmptyState
          icon={<span className="material-symbols-outlined text-[48px]">search</span>}
          title="Select a run to view details."
          description="Click a run on the left to see its timeline and assertions."
        />
      </div>
    );
  }

  const replayCommand = `$ SIBYL_API_URL=http://localhost:4000 sibyl replay ${run.runId}`;
  const events = run.events ? [...run.events].sort((a, b) => a.timestamp - b.timestamp) : undefined;

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header */}
      <header className="bg-surface border-b border-border p-6 shrink-0">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="font-mono font-bold text-2xl text-text">
                {run.runId}
              </h2>
              <Badge variant={statusBadgeVariant(run.status)} className="px-3 py-1 shadow-sm">
                {run.status}
              </Badge>
            </div>
            <div className="text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">account_tree</span>
              <span>Project: <strong className="text-text font-medium">{run.project}</strong></span>
              <span className="mx-2 opacity-50">•</span>
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              <span>{formatDateTimeUtc(run.createdAt)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-md border border-border bg-surface hover:bg-surface-raised text-text-muted hover:text-text transition-colors text-sm font-semibold">
              Export JSON
            </button>
            <button className="px-4 py-2 rounded-md bg-green text-bg hover:bg-green-bright transition-colors text-sm font-semibold shadow-sm">
              Re-run
            </button>
          </div>
        </div>

        {/* Metadata Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-surface-raised border border-border flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase text-text-muted tracking-wide">Duration</span>
            <span className="font-semibold text-text">{formatDuration(run.durationMs)}</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-raised border border-border flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase text-text-muted tracking-wide">Target Cluster</span>
            <span className="font-semibold text-text">us-east-1-prod</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-raised border border-border flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase text-text-muted tracking-wide">Session ID</span>
            <span className="font-semibold text-text font-mono text-sm">{run.sessionId.split('-')[0]}</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-raised border border-border flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase text-text-muted tracking-wide">Seed</span>
            <span className="font-semibold text-text font-mono text-sm" data-testid="run-seed">{run.seed}</span>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex gap-6 px-6 border-b border-border bg-surface shrink-0">
        {[
          { id: "promises", label: `Promises (${run.promiseResults.length})` },
          { id: "schedule", label: "Fault Schedule" },
          { id: "timeline", label: "Event Timeline" },
          { id: "replay", label: "Replay Command" },
        ].map((tab) => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id 
                ? "border-green text-green" 
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "promises" && (
          <PromiseResults results={run.promiseResults} descriptors={run.promises ?? []} />
        )}

        {activeTab === "schedule" && (
          run.concreteSchedules.length === 0 ? (
            <div className="p-8 text-center text-text-muted bg-surface border border-border rounded-xl">
              No faults were scheduled for this run.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-raised text-text-muted text-xs uppercase tracking-wider font-mono">
                  <tr>
                    <th className="px-6 py-4 font-semibold border-b border-border">Domain</th>
                    <th className="px-6 py-4 font-semibold border-b border-border">Type</th>
                    <th className="px-6 py-4 font-semibold border-b border-border">Probability</th>
                    <th className="px-6 py-4 font-semibold border-b border-border">Delay</th>
                    <th className="px-6 py-4 font-semibold border-b border-border">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {run.concreteSchedules.map((schedule) => {
                    const delay = scheduleDelayMs(schedule);
                    return (
                      <tr key={schedule.id} className="hover:bg-surface-raised transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-block px-2 py-1 rounded bg-surface border border-border text-xs font-mono text-text-muted">
                            {schedule.spec.domain}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-text">{schedule.spec.type}</td>
                        <td className="px-6 py-4 text-green">{Math.round(schedule.probability * 1000) / 10}%</td>
                        <td className="px-6 py-4 text-text-muted">{delay === undefined ? "—" : `${delay}ms`}</td>
                        <td className="px-6 py-4 text-text-muted">{scheduleDetails(schedule) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === "timeline" && (
          events === undefined ? (
            <div className="p-8 text-center text-text-muted bg-surface border border-border rounded-xl">
              {run.passed
                ? `Passing runs are stored without a timeline (${run.eventCount} events captured).`
                : "No event timeline was uploaded for this run."}
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-text-muted bg-surface border border-border rounded-xl">
              No telemetry captured for this run.
            </div>
          ) : (
            <div className="bg-[#060e20] p-6 rounded-xl border border-[#2d3449] shadow-inner overflow-hidden">
              <div className="font-mono text-[13px] text-[#dae2fd] space-y-1.5 leading-relaxed">
                {events.map((event, idx) => (
                  <div key={event.id ?? idx} className="flex hover:bg-white/5 px-2 -mx-2 rounded transition-colors group" data-testid="timeline-event">
                    <div className="w-24 shrink-0 text-[#64748b] select-none">
                      {formatTimeUtc(event.timestamp)}
                    </div>
                    <div className="w-20 shrink-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1e293b] text-[#94a3b8]">
                        {event.domain}
                      </span>
                    </div>
                    <div className="flex-1 flex gap-2">
                      {event.fault && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-dim text-red border border-red/20 font-bold shrink-0" data-testid="timeline-fault">
                          {event.fault}
                        </span>
                      )}
                      <span className="text-[#94a3b8] group-hover:text-white transition-colors">{summarizeEvent(event)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {activeTab === "replay" && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Reproduce this exact run (same seed and fault schedule) locally:</p>
            <div className="rounded-xl overflow-hidden border border-[#2d3449] shadow-lg" data-testid="replay-command">
              <CodeBlock code={replayCommand} language="shell" />
            </div>
            <div className="hidden" data-testid="explain-command">
              sibyl explain {run.runId}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
