import * as React from "react";
import { Badge, Card, CodeBlock, Skeleton } from "@sibyl/ui";
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-lg text-gold mb-4">{children}</h3>;
}

function PromiseResults({ results, descriptors }: { results: PromiseResult[]; descriptors: PromiseDescriptor[] }) {
  const byId = new Map(descriptors.map((d) => [d.id, d]));
  // Failed promises first; otherwise keep the reported order (Array#sort is stable).
  const sorted = [...results].sort((a, b) => Number(a.passed) - Number(b.passed));

  if (sorted.length === 0) {
    return <p className="text-sm text-muted">No promise results were reported for this run.</p>;
  }

  return (
    <ul className="space-y-3">
      {sorted.map((result) => {
        const descriptor = byId.get(result.promiseId);
        return (
          <li
            key={`${result.promiseId}:${result.simulationRunId}`}
            data-testid={`promise-${result.promiseId}`}
            className={`rounded-md border p-3 ${result.passed ? "border-ink-3 bg-ink-2/40" : "border-ember/30 bg-ember/5"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.passed ? "pass" : "fail"}>{result.passed ? "PASS" : "FAIL"}</Badge>
              <span className="font-mono text-sm text-parchment font-semibold">{result.promiseId}</span>
              <Badge variant="outline" className="text-[10px]">
                {result.severity}
              </Badge>
              {result.intermittent && (
                <Badge variant="default" className="text-[10px]">
                  INTERMITTENT
                </Badge>
              )}
            </div>
            {descriptor?.description && <p className="mt-1 text-sm text-muted">{descriptor.description}</p>}
            {result.message && (
              <p className={`mt-2 text-sm font-mono ${result.passed ? "text-muted" : "text-ember"}`}>{result.message}</p>
            )}
            {result.actualValue !== undefined && (
              <p className="mt-1 text-xs font-mono text-muted">actual: {String(result.actualValue)}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RunDetail({ run, isLoading, error, onRetry }: RunDetailProps) {
  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <ApiErrorState title="Failed to load run details" error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8" aria-busy="true">
        <header className="flex justify-between items-start">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </header>
        <Card className="p-6 bg-ink border-ink-3">
          <Skeleton className="h-6 w-48 mb-6" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!run) {
    return <div className="h-full flex items-center justify-center text-muted">Select a run to view details.</div>;
  }

  const replayCommand = `sibyl replay ${run.runId}`;
  const explainCommand = `sibyl explain ${run.runId}`;
  const events = run.events ? [...run.events].sort((a, b) => a.timestamp - b.timestamp) : undefined;
  const firstTimestamp = events?.[0]?.timestamp ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-10 p-4">
      <header className="flex flex-col space-y-6 relative">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-gold/10 blur-[60px] rounded-full pointer-events-none" />
        <div className="flex justify-between items-start gap-4 relative z-10">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-3xl text-parchment mb-4 break-all flex items-center gap-3">
              Run <span className="text-gold">{run.runId}</span>
            </h2>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm text-muted font-body bg-white/5 p-4 rounded-xl border border-glass-border shadow-inner">
              <dt className="text-[11px] uppercase tracking-widest opacity-60">Project</dt>
              <dd className="text-parchment font-medium">{run.project}</dd>
              <dt className="text-[11px] uppercase tracking-widest opacity-60">Session</dt>
              <dd className="text-parchment font-mono text-xs break-all bg-black/20 px-1.5 py-0.5 rounded max-w-max">{run.sessionId}</dd>
              <dt className="text-[11px] uppercase tracking-widest opacity-60">Seed</dt>
              <dd className="text-gold font-mono text-xs break-all bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded max-w-max shadow-sm" data-testid="run-seed">
                {run.seed}
              </dd>
              <dt className="text-[11px] uppercase tracking-widest opacity-60">Recorded</dt>
              <dd className="text-parchment">{formatDateTimeUtc(run.createdAt)}</dd>
              <dt className="text-[11px] uppercase tracking-widest opacity-60">Duration</dt>
              <dd className="text-parchment font-mono bg-black/20 px-1.5 py-0.5 rounded max-w-max">{formatDuration(run.durationMs)}</dd>
            </div>
          </div>
          <Badge variant={statusBadgeVariant(run.status)} className="text-sm px-4 py-1.5 shrink-0 shadow-lg shadow-black/20">
            {run.status}
          </Badge>
        </div>

        {run.error && (
          <div role="alert" className="rounded-xl border border-ember/40 bg-ember/10 p-4 text-sm font-mono text-ember shadow-[0_0_15px_rgba(239,90,80,0.15)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-ember" />
            <div className="flex gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{run.error}</span>
            </div>
          </div>
        )}
      </header>

      <Card className="p-6 bg-glass border-glass-border shadow-lg relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <SectionTitle>Replay</SectionTitle>
        <p className="text-sm text-muted mb-4 font-body">Reproduce this exact run (same seed and fault schedule) locally:</p>
        <div className="shadow-inner rounded-md overflow-hidden border border-black/50">
          <CodeBlock code={replayCommand} language="shell" data-testid="replay-command" />
        </div>
      </Card>

      <Card className="p-6 bg-glass border-glass-border shadow-lg">
        <SectionTitle>Promise Results</SectionTitle>
        <PromiseResults results={run.promiseResults} descriptors={run.promises ?? []} />
      </Card>

      <Card className="p-6 bg-glass border-glass-border shadow-lg">
        <SectionTitle>Fault Schedule</SectionTitle>
        {run.concreteSchedules.length === 0 ? (
          <p className="text-sm text-muted font-body bg-white/5 p-4 rounded-lg border border-glass-border">No faults were scheduled for this run.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-glass-border">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-muted font-body tracking-widest bg-white/5">
                <tr>
                  <th className="py-3 pl-4 pr-4 font-semibold border-b border-glass-border">Domain</th>
                  <th className="py-3 pr-4 font-semibold border-b border-glass-border">Type</th>
                  <th className="py-3 pr-4 font-semibold border-b border-glass-border">Probability</th>
                  <th className="py-3 pr-4 font-semibold border-b border-glass-border">Delay</th>
                  <th className="py-3 pr-4 font-semibold border-b border-glass-border">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border font-mono text-xs bg-black/20">
                {run.concreteSchedules.map((schedule) => {
                  const delay = scheduleDelayMs(schedule);
                  const details = scheduleDetails(schedule);
                  return (
                    <tr key={schedule.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 pl-4 pr-4">
                        <Badge variant="outline" className="text-[10px] bg-black/30 border-white/20">
                          {schedule.spec.domain}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-parchment font-semibold">{schedule.spec.type}</td>
                      <td className="py-3 pr-4 text-gold">{Math.round(schedule.probability * 1000) / 10}%</td>
                      <td className="py-3 pr-4 text-muted">{delay === undefined ? "—" : `${delay}ms`}</td>
                      <td className="py-3 pr-4 text-muted">{details || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-glass border-glass-border shadow-lg">
        <SectionTitle>Event Timeline</SectionTitle>
        {events === undefined ? (
          <p className="text-sm text-muted font-body bg-white/5 p-4 rounded-lg border border-glass-border">
            {run.passed
              ? `Passing runs are stored without a timeline${typeof run.eventCount === "number" ? ` (${run.eventCount} events captured)` : ""}.`
              : "No event timeline was uploaded for this run."}
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted font-body bg-white/5 p-4 rounded-lg border border-glass-border">No telemetry captured for this run.</p>
        ) : (
          <div className="bg-black/20 p-5 rounded-xl border border-glass-border shadow-inner">
            <ol className="relative border-l border-glass-border ml-4 space-y-6">
              {events.map((event, idx) => (
                <li key={event.id ?? `${event.timestamp}-${idx}`} className="relative pl-8 group" data-testid="timeline-event">
                  <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-gold bg-gold shadow-[0_0_10px_rgba(226,193,89,0.8)] group-hover:scale-125 transition-transform" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                    <span className="text-xs text-muted font-mono bg-black/40 px-1.5 py-0.5 rounded">{formatTimeUtc(event.timestamp)}</span>
                    <Badge variant="outline" className="font-mono text-[10px] bg-white/5 border-white/20">
                      {event.domain}
                    </Badge>
                    {event.fault && (
                      <Badge variant="fail" className="font-mono text-[10px] shadow-[0_0_10px_rgba(239,90,80,0.3)]" data-testid="timeline-fault">
                        {event.fault}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted font-mono ml-auto opacity-50 hover:opacity-100 transition-opacity">+{event.timestamp - firstTimestamp}ms</span>
                  </div>
                  <p className="mt-1.5 font-mono text-sm text-parchment break-all leading-relaxed">{summarizeEvent(event)}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      {!run.passed && (
        <Card className="p-6 bg-ink">
          <SectionTitle>Explain this failure</SectionTitle>
          <p className="text-sm text-muted mb-3">
            AI root-cause explanations are generated by the CLI, not the dashboard. Run this where your Sibyl project and
            credentials live:
          </p>
          <CodeBlock code={explainCommand} language="shell" data-testid="explain-command" />
        </Card>
      )}
    </div>
  );
}
