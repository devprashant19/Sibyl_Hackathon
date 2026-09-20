import * as React from "react";
import { Badge, Card, CodeBlock, Skeleton, EmptyState } from "@sibyl/ui";
import { AlertCircle } from "lucide-react";

interface RunDetailProps {
  run: any | null;
  events: any[];
  isLoading?: boolean;
  error?: Error;
  onRetry?: () => void;
}

export function RunDetail({
  run,
  events,
  isLoading,
  error,
  onRetry
}: RunDetailProps) {
  const [isExplaining, setIsExplaining] = React.useState(false);
  const [explanationError, setExplanationError] = React.useState<string | null>(null);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState 
          icon={<AlertCircle size={32} className="text-ember" />}
          title="Failed to load run details"
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
      <div className="max-w-3xl mx-auto space-y-8 animate-pulse">
        <header className="flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </header>

        <Card className="p-6 bg-ink border-ink-3">
          <Skeleton className="h-6 w-48 mb-6" />
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
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
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Select a run to view details.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header className="flex flex-col space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-display text-2xl text-gold mb-2">Run {run.id}</h2>
            <div className="flex space-x-4 text-sm text-muted font-mono">
              <span>{new Date(run.timestamp).toLocaleString()}</span>
              <span>Environment: {run.environment}</span>
            </div>
          </div>
          <Badge variant={run.status === "COMPLETED" ? "pass" : "fail"} className="text-sm px-3 py-1">
            {run.status}
          </Badge>
        </div>

        {run.status === "FAILED" && (
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-md border border-ink-3 bg-ink">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted">Assignee:</span>
              <select 
                className="bg-ink-2 border border-ink-3 rounded text-sm px-2 py-1 text-parchment outline-none"
                defaultValue={run.assignee || "unassigned"}
              >
                <option value="unassigned">Unassigned</option>
                <option value="Alice Engineer">Alice Engineer</option>
                <option value="Bob Developer">Bob Developer</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted">Status:</span>
              <select 
                className="bg-ink-2 border border-ink-3 rounded text-sm px-2 py-1 outline-none"
                defaultValue={run.triageStatus || "OPEN"}
              >
                <option value="OPEN" className="text-ember">OPEN</option>
                <option value="INVESTIGATING" className="text-gold">INVESTIGATING</option>
                <option value="RESOLVED" className="text-parchment">RESOLVED</option>
                <option value="WONT_FIX" className="text-muted">WONT_FIX</option>
              </select>
            </div>
            <div className="ml-auto">
              {run.externalIssueUrl ? (
                <a href={run.externalIssueUrl} target="_blank" rel="noreferrer" className="flex items-center space-x-2 px-3 py-1.5 bg-ink-2 border border-ink-3 hover:border-gold/50 rounded-md text-sm transition-colors text-parchment">
                  <span className="w-4 h-4 rounded-sm bg-violet flex items-center justify-center text-[10px] font-bold">L</span>
                  <span>SIB-102</span>
                </a>
              ) : (
                <button className="flex items-center space-x-2 px-3 py-1.5 bg-violet/10 text-violet border border-violet/30 hover:bg-violet/20 rounded-md text-sm transition-colors font-semibold">
                  <span className="w-4 h-4 rounded-sm bg-violet text-ink flex items-center justify-center text-[10px] font-bold">L</span>
                  <span>Create Linear Issue</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <Card className="p-6 bg-ink">
        <h3 className="font-display text-lg text-gold mb-6">Event Timeline</h3>
        <div className="relative border-l border-ink-3 ml-3 space-y-8">
          {events.map((event: any, idx: number) => (
            <div key={event.id} className="relative pl-8">
              {/* Timeline Node */}
              <div className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-ink bg-ink ${event.isFault ? 'bg-ember border-ember ring-4 ring-ember/20' : 'bg-gold border-gold'}`} />
              
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-3">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {event.domain}
                  </Badge>
                  <span className={`font-mono text-sm font-semibold ${event.isFault ? 'text-ember' : 'text-parchment'}`}>
                    {event.type}
                  </span>
                  <span className="text-xs text-muted font-mono ml-auto">
                    +{idx > 0 ? (new Date(event.timestamp).getTime() - new Date(events[0].timestamp).getTime()) : 0}ms
                  </span>
                </div>
                
                {event.payload && (
                  <div className="mt-2">
                    <CodeBlock 
                      code={JSON.stringify(event.payload, null, 2)} 
                      language="json"
                      className="bg-ink-3/30 border-ink-3" 
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {events.length === 0 && (
            <p className="pl-8 text-sm text-muted">No telemetry captured for this run.</p>
          )}
        </div>
      </Card>

      {/* Root Cause & Discussion */}
      {run.status === "FAILED" && (
        <div className="space-y-6">
          {run.rootCauseExplanation ? (
            <Card className="p-6 bg-ember/5 border-ember/20">
              <h3 className="font-display text-lg text-ember mb-2 flex items-center">
                <span className="mr-2">⚡</span> AI Root Cause Analysis
              </h3>
              <p className="text-sm text-parchment leading-relaxed font-body">
                {run.rootCauseExplanation}
              </p>
            </Card>
          ) : explanationError ? (
            <Card className="p-6 bg-ember/5 border-ember/20">
              <h3 className="font-display text-lg text-ember mb-2 flex items-center">
                <AlertCircle className="mr-2 h-5 w-5" /> AI Explanation Unavailable
              </h3>
              <p className="text-sm text-parchment leading-relaxed font-body mb-4">
                {explanationError}
              </p>
              <div className="text-xs text-muted mb-2">Raw captured evidence:</div>
              <CodeBlock 
                code={JSON.stringify({ events: events.filter(e => e.isFault), promise: run.failedPromise }, null, 2)} 
                language="json"
                className="bg-ink-3/30 border-ink-3 max-h-64 overflow-y-auto" 
              />
              <button 
                className="mt-4 px-4 py-2 bg-ink-3 hover:bg-ink-3/80 text-parchment rounded-md text-sm transition-colors"
                onClick={() => setExplanationError(null)}
              >
                Dismiss
              </button>
            </Card>
          ) : (
            <Card className="p-6 bg-ink flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center text-gold text-2xl">
                🤖
              </div>
              <div>
                <h3 className="font-display text-lg text-parchment mb-1">Diagnose this Failure</h3>
                <p className="text-sm text-muted">Use the Sibyl Explainer Agent to analyze the event timeline and determine the root cause.</p>
              </div>
              <button 
                className={`px-4 py-2 bg-gold/10 text-gold border border-gold/30 rounded-md font-semibold text-sm transition-colors hover:bg-gold/20 flex items-center space-x-2 ${isExplaining ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isExplaining}
                onClick={() => {
                  setIsExplaining(true);
                  setTimeout(() => {
                    // Simulate an error (e.g. BudgetExceededError or ClaudeUnavailableError)
                    setExplanationError("Budget exceeded for organization default-org. Current spend: $50.00, Limit: $50.00.");
                    setIsExplaining(false);
                  }, 1000);
                }}
              >
                {isExplaining ? (
                  <>
                    <span className="animate-spin mr-2">⚙️</span>
                    <span>Analyzing telemetry...</span>
                  </>
                ) : (
                  <span>✨ Explain this failure</span>
                )}
              </button>
            </Card>
          )}

          <Card className="p-6 bg-ink flex flex-col">
            <h3 className="font-display text-lg text-gold mb-4">Discussion</h3>
            
            <div className="space-y-4 mb-6">
              {run.comments?.map((comment: any) => (
                <div key={comment.id} className="flex space-x-3">
                  <div className="w-8 h-8 rounded-full bg-ink-3 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-gold">
                      {comment.author.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 bg-ink-2 border border-ink-3 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-parchment">{comment.author}</span>
                      <span className="text-xs text-muted font-mono">{new Date(comment.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm text-muted">
                      {comment.content.split(/(@\w+)/g).map((part: string, i: number) => 
                        part.startsWith('@') ? <span key={i} className="text-gold font-semibold">{part}</span> : part
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {(!run.comments || run.comments.length === 0) && (
                <p className="text-sm text-muted italic">No comments yet.</p>
              )}
            </div>

            <div className="mt-auto">
              <div className="relative">
                <textarea 
                  className="w-full bg-ink-2 border border-ink-3 rounded-lg p-3 text-sm text-parchment outline-none focus:border-gold min-h-[80px] resize-none placeholder:text-ink-3"
                  placeholder="Add a comment... Use @ to mention"
                />
                <button className="absolute bottom-3 right-3 px-3 py-1 bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 rounded font-semibold text-sm transition-colors">
                  Comment
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
