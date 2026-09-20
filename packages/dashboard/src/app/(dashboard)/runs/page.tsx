"use client";

import * as React from "react";
import { ProgressTrack, ErrorBoundary } from "@sibyl/ui";
import { mockRuns, mockEvents } from "../../../lib/mockData";
import { useLiveProgress } from "../../../hooks/useLiveProgress";
import { RunList } from "./components/RunList";
import { RunDetail } from "./components/RunDetail";

export default function RunExplorer() {
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(mockRuns.length > 0 ? mockRuns[0].id : null);
  // Optional: Add state to simulate loading/errors if needed, but for now we'll just pass the mock data
  const [isLoading, setIsLoading] = React.useState(false);

  // Hardcode session ID and fake API URL for this UI-only phase
  const sessionId = "session-12345";
  const { progress, isConnected, injectMockEvent, setTotalRuns } = useLiveProgress(sessionId, "http://localhost:4000/api/v1");

  const selectedRun = mockRuns.find((r) => r.id === selectedRunId) || null;
  const events = selectedRunId ? (mockEvents[selectedRunId] || []) : [];

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
          
          <ErrorBoundary>
            <RunList 
              runs={mockRuns} 
              selectedRunId={selectedRunId} 
              onSelectRun={setSelectedRunId} 
              isLoading={isLoading} 
            />
          </ErrorBoundary>
        </div>

        {/* Right Panel: Run Detail */}
        <div className="w-2/3 h-full overflow-y-auto bg-ink-2 p-8">
          <ErrorBoundary>
            <RunDetail 
              run={selectedRun} 
              events={events} 
              isLoading={isLoading} 
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
