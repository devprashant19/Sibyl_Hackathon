"use client";

import * as React from "react";
import { Badge, Card, CodeBlock } from "@sibyl/ui";
import { mockRuns, mockEvents, SimulationRun } from "../../../lib/mockData";

export default function RunExplorer() {
  const [selectedRunId, setSelectedRunId] = React.useState<string>(mockRuns[0].id);

  const selectedRun = mockRuns.find((r) => r.id === selectedRunId);
  const events = mockEvents[selectedRunId] || [];

  return (
    <div className="flex h-full w-full">
      {/* Left Panel: Run List */}
      <div className="w-1/3 border-r border-ink-3 flex flex-col h-full bg-ink">
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
            <header className="flex justify-between items-center">
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
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted">
            Select a run to view details.
          </div>
        )}
      </div>
    </div>
  );
}
