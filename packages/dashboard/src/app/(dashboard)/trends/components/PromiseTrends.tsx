import * as React from "react";
import { Badge, Card, ProgressTrack, Skeleton, EmptyState } from "@sibyl/ui";
import { ApiErrorState } from "../../../../components/ApiErrorState";
import type { PromiseTrend, PromiseTrendPoint } from "../../../../lib/api-types";
import { formatDateTimeUtc, formatPercent, shortId } from "../../../../lib/format";

interface PromiseTrendsProps {
  trends: PromiseTrend[];
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * Fail rate of one point as a 0..1 fraction. Derived from failedRuns/runs when possible so the view
 * does not depend on whether the API reports `failRate` as a fraction or a percentage.
 */
export function pointFailRate(point: PromiseTrendPoint): number {
  if (point.runs > 0) return point.failedRuns / point.runs;
  if (!Number.isFinite(point.failRate)) return 0;
  return point.failRate > 1 ? point.failRate / 100 : point.failRate;
}

function colorFor(rate: number): "gold" | "violet" | "ember" {
  if (rate === 0) return "gold";
  if (rate < 0.1) return "violet";
  return "ember";
}

const MAX_POINTS = 10;

export function PromiseTrends({ trends, isLoading, error, onRetry }: PromiseTrendsProps) {
  if (error) {
    return (
      <div className="p-8">
        <ApiErrorState title="Failed to load promise trends" error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64 mb-6" />
            <div className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <EmptyState
        title="No promises evaluated yet"
        description="No runs yet — run `sibyl run` with SIBYL_API_URL set. Each uploaded session adds a point per promise."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {trends.map((trend) => {
        const points = [...trend.points].sort((a, b) => a.completedAt - b.completedAt);
        const recent = points.slice(-MAX_POINTS);
        const latest = points[points.length - 1];
        const latestRate = latest ? pointFailRate(latest) : 0;
        const totals = points.reduce(
          (acc, p) => ({ runs: acc.runs + p.runs, failed: acc.failed + p.failedRuns }),
          { runs: 0, failed: 0 },
        );

        return (
          <Card key={trend.promiseId} className="p-6" data-testid={`trend-card-${trend.promiseId}`}>
            <div className="flex justify-between items-start gap-4 mb-1">
              <h3 className="font-mono text-lg text-parchment break-all">{trend.promiseId}</h3>
              <Badge variant="outline">{trend.severity}</Badge>
            </div>
            <p className="text-sm text-muted mb-4">{trend.description}</p>

            {latest ? (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm font-mono">
                  <span className={latestRate > 0 ? "text-ember" : "text-gold"}>
                    {formatPercent(latestRate)} fail rate (latest session)
                  </span>
                  <span className="text-muted">
                    {totals.failed}/{totals.runs} runs failed across {points.length}{" "}
                    {points.length === 1 ? "session" : "sessions"}
                  </span>
                </div>
                <ProgressTrack value={latestRate * 100} indicatorColor={colorFor(latestRate)} />
              </div>
            ) : (
              <p className="text-sm text-muted mb-4">No sessions have evaluated this promise yet.</p>
            )}

            {recent.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-muted uppercase">
                    <tr>
                      <th className="py-1 pr-4 font-semibold">Session</th>
                      <th className="py-1 pr-4 font-semibold">Completed</th>
                      <th className="py-1 pr-4 font-semibold">Failed / Runs</th>
                      <th className="py-1 font-semibold w-1/3">Fail rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-3">
                    {[...recent].reverse().map((point) => {
                      const rate = pointFailRate(point);
                      return (
                        <tr key={point.sessionId}>
                          <td className="py-1.5 pr-4 text-parchment" title={point.sessionId}>
                            {shortId(point.sessionId)}
                          </td>
                          <td className="py-1.5 pr-4 text-muted">{formatDateTimeUtc(point.completedAt)}</td>
                          <td className="py-1.5 pr-4 text-parchment">
                            {point.failedRuns} / {point.runs}
                          </td>
                          <td className="py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-14 ${rate > 0 ? "text-ember" : "text-muted"}`}>{formatPercent(rate)}</span>
                              <ProgressTrack value={rate * 100} indicatorColor={colorFor(rate)} className="h-1.5" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {points.length > MAX_POINTS && (
                  <p className="mt-2 text-xs text-muted">Showing the {MAX_POINTS} most recent of {points.length} sessions.</p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
