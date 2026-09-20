"use client";

import * as React from "react";
import { api, getApiBaseUrl } from "../lib/api";
import type { HealthResponse } from "../lib/api-types";

const POLL_MS = 30_000;

/** Small header indicator backed by GET /api/health. */
export function ApiStatus() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [state, setState] = React.useState<"checking" | "ok" | "down">("checking");

  React.useEffect(() => {
    let controller: AbortController | null = null;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      api.health({ signal, timeoutMs: 4000 }).then(
        (h) => {
          if (signal.aborted) return;
          setHealth(h);
          setState("ok");
        },
        () => {
          if (signal.aborted) return;
          setHealth(null);
          setState("down");
        },
      );
    };
    check();
    const interval = setInterval(check, POLL_MS);
    return () => {
      clearInterval(interval);
      controller?.abort();
    };
  }, []);

  const base = getApiBaseUrl();
  const dot = state === "ok" ? "bg-gold" : state === "down" ? "bg-ember" : "bg-ink-3 animate-pulse";
  const label =
    state === "ok" && health
      ? `API ${health.version} · ${health.sessions} sessions · ${health.runs} runs`
      : state === "down"
        ? "API unreachable"
        : "Checking API…";

  return (
    <span className="text-xs font-mono text-muted flex items-center" title={base} data-testid="api-status">
      <span className={`w-2 h-2 rounded-full mr-2 ${dot}`} />
      {label}
      <span className="ml-2 text-muted/60 hidden lg:inline">{base}</span>
    </span>
  );
}
