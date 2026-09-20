"use client";

import * as React from "react";
import { Badge, ProgressTrack } from "@sibyl/ui";
import { useLiveProgress, type SessionProgress } from "../../../../hooks/useLiveProgress";
import { shortId } from "../../../../lib/format";

interface LiveSessionsProps {
  /** Called when a session finishes so the page can refresh its run list. */
  onSessionCompleted?: (progress: SessionProgress) => void;
  /** Only show this many sessions (most recently updated first). */
  limit?: number;
}

function ConnectionIndicator({ connection, retryInMs }: { connection: string; retryInMs: number | null }) {
  const label =
    connection === "open"
      ? "Live"
      : connection === "reconnecting"
        ? `Stream unavailable — retrying in ${Math.round((retryInMs ?? 0) / 1000)}s`
        : "Connecting…";
  const dot = connection === "open" ? "bg-gold animate-pulse" : connection === "reconnecting" ? "bg-ember" : "bg-ink-3";
  return (
    <span className="flex items-center gap-2 text-xs text-muted font-mono" data-testid="live-connection">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

/** Live progress for search sessions, fed by GET /api/v1/events (server-sent events). */
export function LiveSessions({ onSessionCompleted, limit = 4 }: LiveSessionsProps) {
  const { sessions, connection, retryInMs, url } = useLiveProgress({ onSessionCompleted });
  const visible = sessions.slice(0, limit);

  return (
    <section className="border-b border-ink-3 p-6 bg-ink-2 shrink-0" aria-label="Live sessions">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-3 gap-4">
          <h1 className="font-display text-2xl text-gold">Live Sessions</h1>
          <span title={url}>
            <ConnectionIndicator connection={connection} retryInMs={retryInMs} />
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted font-mono">
            No sessions in flight. Progress appears here while <code className="text-parchment">sibyl run</code> is
            running with SIBYL_API_URL set.
          </p>
        ) : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visible.map((s) => {
              const pct = s.total > 0 ? (s.done / s.total) * 100 : s.status === "COMPLETED" ? 100 : 0;
              return (
                <li
                  key={s.sessionId}
                  data-testid={`live-session-${s.sessionId}`}
                  className="rounded-md border border-ink-3 bg-ink p-4"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-parchment truncate" title={s.sessionId}>
                        {s.project ? `${s.project} · ` : ""}session {shortId(s.sessionId)}
                      </div>
                      {s.lastRun && (
                        <div className="text-xs text-muted font-mono truncate">
                          last run {shortId(s.lastRun.runId)} · {s.lastRun.status}
                        </div>
                      )}
                    </div>
                    <Badge variant={s.status === "COMPLETED" ? "pass" : "outline"}>{s.status}</Badge>
                  </div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-parchment" data-testid="live-session-count">
                      {s.done} / {s.total}
                    </span>
                    <span className={s.failures > 0 ? "text-ember" : "text-muted"}>
                      {s.failures} {s.failures === 1 ? "failure" : "failures"}
                    </span>
                  </div>
                  <ProgressTrack value={pct} indicatorColor={s.failures > 0 ? "ember" : "gold"} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
