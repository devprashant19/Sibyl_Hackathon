import * as React from "react";
import { Badge, Skeleton, EmptyState } from "@sibyl/ui";
import { ApiErrorState } from "../../../../components/ApiErrorState";
import type { PromiseTrend, PromiseTrendPoint } from "../../../../lib/api-types";
import { formatPercent, shortId } from "../../../../lib/format";

interface PromiseTrendsProps {
  trends: PromiseTrend[];
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export function pointFailRate(point: PromiseTrendPoint): number {
  if (point.runs > 0) return point.failedRuns / point.runs;
  if (!Number.isFinite(point.failRate)) return 0;
  return point.failRate > 1 ? point.failRate / 100 : point.failRate;
}

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
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5"><Skeleton className="h-64 w-full rounded-xl" /></div>
          <div className="lg:col-span-7"><Skeleton className="h-64 w-full rounded-xl" /></div>
        </div>
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

  // Calculate top failing promises from trends
  const topFailing = trends.map(t => {
    const totalRuns = t.points.reduce((sum, p) => sum + p.runs, 0);
    const totalFailed = t.points.reduce((sum, p) => sum + p.failedRuns, 0);
    const failRate = totalRuns > 0 ? totalFailed / totalRuns : 0;
    return { ...t, totalRuns, totalFailed, failRate };
  }).filter(t => t.totalFailed > 0).sort((a, b) => b.failRate - a.failRate).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Full-Width Chart Card */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="font-semibold text-lg text-text">System Reliability</h3>
            <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green" /> Observed</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-red border-t border-dashed border-red" /> SLA Target</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-amber/20 border border-amber/40" /> Chaos Windows</span>
            </div>
          </div>
          <div className="flex bg-surface-raised border border-border rounded-md p-0.5 text-xs">
            <button className="px-3 py-1 rounded hover:bg-surface text-text-muted">1D</button>
            <button className="px-3 py-1 rounded bg-surface border border-border text-text shadow-sm">7D</button>
            <button className="px-3 py-1 rounded hover:bg-surface text-text-muted">30D</button>
          </div>
        </div>

        {/* Pure SVG Line Chart */}
        <div className="h-64 w-full relative group">
          <svg viewBox="0 0 1000 240" preserveAspectRatio="none" className="w-full h-full overflow-visible">
            {/* Gridlines */}
            {[0, 1, 2, 3, 4].map(i => (
              <line key={i} x1="0" y1={i * 60} x2="1000" y2={i * 60} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
            ))}
            {/* SLA Target Line */}
            <line x1="0" y1="40" x2="1000" y2="40" stroke="var(--red)" strokeWidth="2" strokeDasharray="6 4" opacity="0.8" />
            
            {/* Chaos Windows (Amber highlights) */}
            <rect x="200" y="0" width="80" height="240" fill="var(--amber)" opacity="0.05" />
            <rect x="600" y="0" width="120" height="240" fill="var(--amber)" opacity="0.05" />

            {/* Filled Area */}
            <path 
              d="M0,80 C100,75 150,110 200,105 C250,100 280,180 300,185 C350,195 400,60 500,50 C600,40 650,150 700,140 C800,120 900,20 1000,10 L1000,240 L0,240 Z" 
              fill="url(#greenGradient)" 
              opacity="0.2" 
            />
            {/* Line Curve */}
            <path 
              d="M0,80 C100,75 150,110 200,105 C250,100 280,180 300,185 C350,195 400,60 500,50 C600,40 650,150 700,140 C800,120 900,20 1000,10" 
              fill="none" 
              stroke="var(--green)" 
              strokeWidth="3" 
            />

            <defs>
              <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--green)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--bg)" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-text-dim font-mono transform -translate-x-full pr-2">
            <span>100%</span>
            <span>99.9%</span>
            <span>99.0%</span>
            <span>95.0%</span>
            <span>90.0%</span>
          </div>
        </div>
      </div>

      {/* 2-Column Breakdown Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Failures by Fault Type */}
        <div className="lg:col-span-5 bg-surface border border-border rounded-xl p-6 flex flex-col">
          <h3 className="font-semibold text-lg text-text mb-6">Failures by Fault Type</h3>
          
          <div className="space-y-5 flex-1">
            {[
              { type: 'Network Drop', rate: 45 },
              { type: 'Database Deadlock', rate: 28 },
              { type: 'Latency Spike', rate: 18 },
              { type: 'Pod Eviction', rate: 9 },
            ].map(f => (
              <div key={f.type}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-text font-medium">{f.type}</span>
                  <span className="text-text-muted font-mono">{f.rate}%</span>
                </div>
                <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
                  <div className="h-full bg-amber rounded-full" style={{ width: `${f.rate}%` }} />
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-6 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-surface-raised text-text-muted hover:text-text transition-colors">
            View Full Breakdown
          </button>
        </div>

        {/* Right: Top Failing Promises */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-xl p-0 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="font-semibold text-lg text-text">Top Failing Promises</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-raised text-text-muted text-xs uppercase tracking-wider font-mono">
                <tr>
                  <th className="px-6 py-3 font-semibold border-b border-border">Promise Name</th>
                  <th className="px-6 py-3 font-semibold border-b border-border">Impact</th>
                  <th className="px-6 py-3 font-semibold border-b border-border">Fail Rate</th>
                  <th className="px-6 py-3 font-semibold border-b border-border">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topFailing.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                      No failing promises found. Systems are resilient!
                    </td>
                  </tr>
                ) : (
                  topFailing.map((trend) => (
                    <tr key={trend.promiseId} className="hover:bg-surface-raised transition-colors" data-testid={`trend-card-${trend.promiseId}`}>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-text">{trend.promiseId}</div>
                        <div className="text-xs text-text-muted mt-1 truncate max-w-[200px]" title={trend.description}>
                          {trend.description}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="fail" className="text-[10px]">{trend.severity}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-red font-mono font-medium">{formatPercent(trend.failRate)}</div>
                        <div className="text-xs text-text-muted">{trend.totalFailed}/{trend.totalRuns} runs</div>
                      </td>
                      <td className="px-6 py-4">
                        <button className="px-3 py-1.5 rounded bg-surface border border-border hover:border-text-dim text-xs font-semibold text-text transition-colors">
                          View Drill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
