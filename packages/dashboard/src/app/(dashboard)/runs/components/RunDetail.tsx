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
    <div className="max-w-3xl mx-auto space-y-8">
      <header className="flex flex-col space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-gold mb-2 break-all">Run {run.runId}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted font-mono">
              <dt>Project</dt>
              <dd className="text-parchment">{run.project}</dd>
              <dt>Session</dt>
              <dd className="text-parchment break-all">{run.sessionId}</dd>
              <dt>Seed</dt>
              <dd className="text-parchment break-all" data-testid="run-seed">
                {run.seed}
              </dd>
              <dt>Recorded</dt>
              <dd className="text-parchment">{formatDateTimeUtc(run.createdAt)}</dd>
              <dt>Duration</dt>
              <dd className="text-parchment">{formatDuration(run.durationMs)}</dd>
            </dl>
          </div>
          <Badge variant={statusBadgeVariant(run.status)} className="text-sm px-3 py-1 shrink-0">
            {run.status}
          </Badge>
        </div>

        {run.error && (
          <div role="alert" className="rounded-md border border-ember/30 bg-ember/5 p-3 text-sm font-mono text-ember">
            {run.error}
          </div>
        )}
      </header>

      <Card className="p-6 bg-ink">
        <SectionTitle>Replay</SectionTitle>
        <p className="text-sm text-muted mb-3">Reproduce this exact run (same seed and fault schedule) locally:</p>
        <CodeBlock code={replayCommand} language="shell" data-testid="replay-command" />
      </Card>

      <Card className="p-6 bg-ink">
        <SectionTitle>Promise Results</SectionTitle>
        <PromiseResults results={run.promiseResults} descriptors={run.promises ?? []} />
      </Card>

      <Card className="p-6 bg-ink">
        <SectionTitle>Fault Schedule</SectionTitle>
        {run.concreteSchedules.length === 0 ? (
          <p className="text-sm text-muted">No faults were scheduled for this run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted font-mono">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Domain</th>
                  <th className="py-2 pr-4 font-semibold">Type</th>
                  <th className="py-2 pr-4 font-semibold">Probability</th>
                  <th className="py-2 pr-4 font-semibold">Delay</th>
                  <th className="py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-3 font-mono">
                {run.concreteSchedules.map((schedule) => {
                  const delay = scheduleDelayMs(schedule);
                  const details = scheduleDetails(schedule);
                  return (
                    <tr key={schedule.id}>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-[10px]">
                          {schedule.spec.domain}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-parchment">{schedule.spec.type}</td>
                      <td className="py-2 pr-4 text-parchment">{Math.round(schedule.probability * 1000) / 10}%</td>
                      <td className="py-2 pr-4 text-parchment">{delay === undefined ? "—" : `${delay}ms`}</td>
                      <td className="py-2 text-muted text-xs">{details || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-ink">
        <SectionTitle>Event Timeline</SectionTitle>
        {events === undefined ? (
          <p className="text-sm text-muted">
            {run.passed
              ? `Passing runs are stored without a timeline${typeof run.eventCount === "number" ? ` (${run.eventCount} events captured)` : ""}.`
              : "No event timeline was uploaded for this run."}
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted">No telemetry captured for this run.</p>
        ) : (
          <ol className="relative border-l border-ink-3 ml-3 space-y-5">
            {events.map((event, idx) => (
              <li key={event.id ?? `${event.timestamp}-${idx}`} className="relative pl-8" data-testid="timeline-event">
                <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-gold bg-gold" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-muted font-mono">{formatTimeUtc(event.timestamp)}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {event.domain}
                  </Badge>
                  {event.fault && (
                    <Badge variant="fail" className="font-mono text-[10px]" data-testid="timeline-fault">
                      {event.fault}
                    </Badge>
                  )}
                  <span className="text-xs text-muted font-mono ml-auto">+{event.timestamp - firstTimestamp}ms</span>
                </div>
                <p className="mt-1 font-mono text-sm text-parchment break-all">{summarizeEvent(event)}</p>
              </li>
            ))}
          </ol>
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
