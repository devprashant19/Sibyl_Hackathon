"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, getApiBaseUrl } from "../lib/api";

type Phase = "idle" | "launching" | "running" | "done" | "error";

interface SimRun {
  done: number;
  total: number;
  failures: number;
}

interface LaunchSimulationButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function LaunchSimulationButton({ className, children }: LaunchSimulationButtonProps) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState<SimRun | null>(null);
  const [project, setProject] = React.useState<string>("");
  const [sessionId, setSessionId] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");
  const esRef = React.useRef<EventSource | null>(null);

  const reset = () => {
    esRef.current?.close();
    esRef.current = null;
    setPhase("idle");
    setProgress(null);
    setError("");
    setSessionId("");
    setProject("");
  };

  const handleLaunch = async () => {
    if (phase !== "idle") return;
    setPhase("launching");
    setError("");
    try {
      const result = await api.launchDemoRun();
      setSessionId(result.sessionId);
      setProject(result.project);
      setPhase("running");
      setProgress({ done: 0, total: 1, failures: 0 });

      // Listen to SSE for this specific session
      const es = new EventSource(`${getApiBaseUrl()}/api/v1/sessions/${result.sessionId}/progress`);
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as { type: string; done: number; total: number; failures: number };
          setProgress({ done: data.done, total: data.total, failures: data.failures });
          if (data.type === "completed") {
            es.close();
            esRef.current = null;
            setPhase("done");
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        esRef.current = null;
        // If we have some progress already, still show done
        setPhase((p) => (p === "running" ? "done" : p));
      };
    } catch (err: any) {
      setError(err?.message ?? "Failed to launch simulation");
      setPhase("error");
    }
  };

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <>
      <button
        onClick={handleLaunch}
        disabled={phase !== "idle"}
        className={className}
      >
        {children ?? "Launch Simulation"}
      </button>

      {/* Modal overlay */}
      {phase !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && phase === "done") reset(); }}>
          <div className="bg-surface border border-border rounded-2xl p-8 w-[480px] max-w-[95vw] shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <img src="/logo.jpg" alt="Sibyl" className="w-8 h-8 rounded-md object-cover" />
              <div>
                <p className="font-semibold text-text text-sm">Sibyl Engine</p>
                <p className="text-text-muted text-xs font-mono">{project ? `project: ${project}` : "initializing…"}</p>
              </div>
              {phase === "done" && (
                <button onClick={reset} className="ml-auto text-text-muted hover:text-text transition-colors" title="Close">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              )}
            </div>

            {/* Progress bar */}
            {(phase === "running" || phase === "done") && progress && (
              <div className="mb-6">
                <div className="flex justify-between text-xs font-mono text-text-muted mb-2">
                  <span>{progress.done} / {progress.total} runs</span>
                  <span className={progress.failures > 0 ? "text-red" : "text-green"}>{progress.failures} failed</span>
                </div>
                <div className="h-2 bg-surface-raised rounded-full overflow-hidden border border-border">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${progress.failures > 0 ? "bg-red" : "bg-green"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-text-dim mt-1 font-mono text-right">{pct}%</p>
              </div>
            )}

            {/* Launching spinner */}
            {phase === "launching" && (
              <div className="flex items-center gap-3 text-text-muted text-sm mb-6">
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Connecting to Sibyl API…
              </div>
            )}

            {/* Log lines */}
            <div className="bg-bg rounded-lg border border-border p-4 font-mono text-xs text-text-muted space-y-1 min-h-[80px] max-h-[160px] overflow-y-auto">
              {phase === "launching" && <p className="text-green animate-pulse">▶ sibyl run --project {project || "…"} -n 30</p>}
              {(phase === "running" || phase === "done") && progress && (
                <>
                  <p className="text-green">▶ sibyl run --project {project} --strategy {project === "checkout" ? "ucb1" : "bayesian"}</p>
                  <p>  Strategy: {project === "checkout" ? "UCB1 (explore/exploit)" : "Bayesian (probability estimation)"}</p>
                  <p>  Injecting: {project === "checkout" ? "HTTP/HTTP_5XX" : "HTTP/SLOW_RESPONSE"}</p>
                  {progress.done > 0 && <p className="text-text">  Progress: {progress.done}/{progress.total} runs · {progress.failures} failures found</p>}
                  {phase === "done" && progress.failures > 0 && (
                    <p className="text-red">  ✗ Promise violation detected — saved to session store</p>
                  )}
                  {phase === "done" && progress.failures === 0 && (
                    <p className="text-green">  ✓ All promises held across all {progress.total} runs</p>
                  )}
                </>
              )}
              {phase === "error" && <p className="text-red">✗ {error}</p>}
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3 justify-end">
              {phase === "done" && (
                <>
                  <button
                    onClick={reset}
                    className="px-4 py-2 text-sm text-text-muted hover:text-text border border-border rounded-lg transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => { reset(); router.push(`/runs?session=${sessionId}`); }}
                    className="px-4 py-2 text-sm bg-green text-bg font-semibold rounded-lg hover:bg-green-bright transition-colors"
                  >
                    View Results →
                  </button>
                </>
              )}
              {phase === "error" && (
                <button onClick={reset} className="px-4 py-2 text-sm border border-border rounded-lg text-text-muted hover:text-text transition-colors">
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
