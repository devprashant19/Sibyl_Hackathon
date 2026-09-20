import * as React from "react";
import { Card, ProgressTrack, Skeleton, EmptyState } from "@sibyl/ui";
import { AlertCircle } from "lucide-react";

interface Trend {
  id: string;
  name: string;
  description: string;
  passRate: number;
  totalRuns: number;
}

interface PromiseTrendsProps {
  trends: Trend[];
  isLoading?: boolean;
  error?: Error;
  onRetry?: () => void;
}

export function PromiseTrends({ trends, isLoading, error, onRetry }: PromiseTrendsProps) {
  if (error) {
    return (
      <div className="p-8">
        <EmptyState 
          icon={<AlertCircle size={32} className="text-ember" />}
          title="Failed to load promise trends"
          description={error.message || "An unexpected error occurred while fetching trend data."}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
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
        description="Write your first programmatic promise and run a simulation to start tracking pass rates."
        action={
          <button 
            className="px-4 py-2 bg-gold/10 text-gold hover:bg-gold/20 border border-gold/30 rounded-md text-sm transition-colors"
            onClick={() => alert('Mock: Go to Docs for Promises')}
          >
            Learn about Promises
          </button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {trends.map(trend => {
        let indicatorColor: "gold" | "ember" | "violet" = "gold";
        if (trend.passRate < 50) indicatorColor = "ember";
        else if (trend.passRate < 80) indicatorColor = "violet";

        return (
          <Card key={trend.id} className="p-6" data-testid={`trend-card-${trend.id}`}>
            <h3 className="font-display text-lg text-parchment mb-1">{trend.name}</h3>
            <p className="text-sm text-muted mb-6">{trend.description}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-mono">
                <span className={`text-${indicatorColor}`}>{trend.passRate}% Pass Rate</span>
                <span className="text-muted">{trend.totalRuns.toLocaleString()} Runs</span>
              </div>
              <ProgressTrack value={trend.passRate} indicatorColor={indicatorColor} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
