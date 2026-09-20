"use client";

import * as React from "react";
import { Badge, Card, CodeBlock, ProgressTrack } from "@sibyl/ui";
import { mockRuns, mockEvents } from "../../../lib/mockData";
import { useLiveProgress } from "../../../hooks/useLiveProgress";

export default function RunExplorer() {
  const [selectedRunId, setSelectedRunId] = React.useState<string>(mockRuns[0].id);

  // Hardcode session ID and fake API URL for this UI-only phase
  const sessionId = "session-12345";
  const { progress, isConnected, injectMockEvent, setTotalRuns } = useLiveProgress(sessionId, "http://localhost:4000/api/v1");

  const selectedRun = mockRuns.find((r) => r.id === selectedRunId);
  const events = mockEvents[selectedRunId] || [];

  // Mock Simulator
  const simulateLiveSession = () => {
    setTotalRuns(5000);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > 500) {
        clearInterval(interval);
        return;
      }
      // 5% chance of failure
      const isFailure = Math.random() < 0.05;
      const runId = `live-run-${Math.floor(Math.random() * 10000)}`;
      injectMockEvent(isFailure, runId);
    }, 50); // Fast stream of events
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Search Session Header (Live Progress) */}
      <div className="border-b border-ink-3 p-6 bg-ink-2 shrink-0">
        <div className="flex justify-between items-end max-w-7xl mx-auto">
          <div className="flex-1 mr-8">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h1 className="font-display text-2xl text-gold">Search Session: {sessionId}</h1>
                <div className="flex items-center space-x-2 text-sm text-muted mt-1 font-mono">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-gold animate-pulse' : 'bg-ink-3'}`} />
                  <span>{isConnected ? 'Connected to Stream' : 'Offline'}</span>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xl text-parchment">{progress.completed} / {progress.totalRuns || 5000}</div>
                <div className="text-sm text-ember">{progress.failures} Failures Found</div>
              </div>
            </div>
            <ProgressTrack 
              value={progress.totalRuns > 0 ? (progress.completed / progress.totalRuns) * 100 : 0} 
              indicatorColor="gold" 
            />
          </div>
          <button 
            onClick={simulateLiveSession}
            className="px-4 py-2 bg-ink-3 hover:bg-ink-3/80 text-parchment rounded-md text-sm font-mono transition-colors"
          >
            ▶ Simulate Live Traffic
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Run List */}
        <div className="w-1/3 border-r border-ink-3 flex flex-col h-full bg-ink">
          
          {/* AI Investigator */}
          <div className="p-4 border-b border-ink-3 bg-ink-2/50">
            <h2 className="font-display text-sm text-gold mb-2 flex items-center">
              <span className="mr-2">🕵️</span> AI Investigator
            </h2>
            <div className="relative">
              <input 
                type="text" 
                placeholder='e.g. "Customer got charged but order failed"'
                className="w-full bg-ink border border-ink-3 rounded p-2 pr-10 text-xs text-parchment outline-none focus:border-gold placeholder:text-ink-3"
              />
              <button 
                className="absolute right-1 top-1 bottom-1 px-2 bg-gold/10 hover:bg-gold/20 text-gold rounded text-xs transition-colors"
                onClick={() => alert("Mock: Submitting to Sibyl AI Investigator")}
              >
                Go
              </button>
            </div>
          </div>

          <div className="p-4 border-b border-ink-3">
            <h2 className="font-display text-lg text-gold">Simulation Runs</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
          {mockRuns.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
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
      </div>

      {/* Right Panel: Run Detail */}
      <div className="w-2/3 h-full overflow-y-auto bg-ink-2 p-8">
        {selectedRun ? (
          <div className="max-w-3xl mx-auto space-y-8">
            <header className="flex flex-col space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-display text-2xl text-gold mb-2">Run {selectedRun.id}</h2>
                  <div className="flex space-x-4 text-sm text-muted font-mono">
                    <span>{new Date(selectedRun.timestamp).toLocaleString()}</span>
                    <span>Environment: {selectedRun.environment}</span>
                  </div>
                </div>
                <Badge variant={selectedRun.status === "COMPLETED" ? "pass" : "fail"} className="text-sm px-3 py-1">
                  {selectedRun.status}
                </Badge>
              </div>

              {selectedRun.status === "FAILED" && (
                <div className="flex flex-wrap items-center gap-4 p-4 rounded-md border border-ink-3 bg-ink">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted">Assignee:</span>
                    <select 
                      className="bg-ink-2 border border-ink-3 rounded text-sm px-2 py-1 text-parchment outline-none"
                      defaultValue={selectedRun.assignee || "unassigned"}
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
                      defaultValue={selectedRun.triageStatus || "OPEN"}
                    >
                      <option value="OPEN" className="text-ember">OPEN</option>
                      <option value="INVESTIGATING" className="text-gold">INVESTIGATING</option>
                      <option value="RESOLVED" className="text-parchment">RESOLVED</option>
                      <option value="WONT_FIX" className="text-muted">WONT_FIX</option>
                    </select>
                  </div>
                  <div className="ml-auto">
                    {selectedRun.externalIssueUrl ? (
                      <a href={selectedRun.externalIssueUrl} target="_blank" rel="noreferrer" className="flex items-center space-x-2 px-3 py-1.5 bg-ink-2 border border-ink-3 hover:border-gold/50 rounded-md text-sm transition-colors text-parchment">
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
                {events.map((event, idx) => (
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
            {selectedRun.status === "FAILED" && (
              <div className="space-y-6">
                {selectedRun.rootCauseExplanation && (
                  <Card className="p-6 bg-ember/5 border-ember/20">
                    <h3 className="font-display text-lg text-ember mb-2 flex items-center">
                      <span className="mr-2">⚡</span> AI Root Cause Analysis
                    </h3>
                    <p className="text-sm text-parchment leading-relaxed font-body">
                      {selectedRun.rootCauseExplanation}
                    </p>
                  </Card>
                )}

                <Card className="p-6 bg-ink flex flex-col">
                  <h3 className="font-display text-lg text-gold mb-4">Discussion</h3>
                  
                  <div className="space-y-4 mb-6">
                    {selectedRun.comments?.map((comment) => (
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
                            {comment.content.split(/(@\w+)/g).map((part, i) => 
                              part.startsWith('@') ? <span key={i} className="text-gold font-semibold">{part}</span> : part
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!selectedRun.comments || selectedRun.comments.length === 0) && (
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
        ) : (
          <div className="h-full flex items-center justify-center text-muted">
            Select a run to view details.
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
