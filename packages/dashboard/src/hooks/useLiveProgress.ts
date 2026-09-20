"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ProgressEvent, RunStatusValue } from "../lib/api-types";

export type SessionProgressStatus = "RUNNING" | "COMPLETED";

export interface SessionProgress {
  sessionId: string;
  project?: string;
  done: number;
  total: number;
  failures: number;
  status: SessionProgressStatus;
  lastRun?: { runId: string; status: RunStatusValue };
  /** Run ids of the most recent non-passing runs seen on the stream, newest first. */
  latestFailures: string[];
  /** Client receive time (epoch ms) of the last event for this session. */
  updatedAt: number;
}

/** connecting: first attempt; open: receiving; reconnecting: waiting for backoff after an error. */
export type StreamConnection = "connecting" | "open" | "reconnecting";

export interface UseLiveProgressOptions {
  /** Follow a single session's stream instead of the global /api/v1/events stream. */
  sessionId?: string;
  /** Called once per session when a `completed` event arrives. */
  onSessionCompleted?: (progress: SessionProgress) => void;
  /** Backoff bounds for reconnects (ms). */
  initialRetryMs?: number;
  maxRetryMs?: number;
  /** Override the stream URL (defaults to the API client's progress URL). */
  url?: string;
}

export interface LiveProgressState {
  /** Sessions seen since mount, most recently updated first. */
  sessions: SessionProgress[];
  connection: StreamConnection;
  /** Delay before the next reconnect attempt, when `connection === "reconnecting"`. */
  retryInMs: number | null;
  url: string;
}

const NON_PASSING: ReadonlySet<string> = new Set(["FAILED", "ERRORED", "INTERMITTENT"]);

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function parseProgressEvent(raw: string): ProgressEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (e.type !== "progress" && e.type !== "completed") return null;
  if (typeof e.sessionId !== "string" || !e.sessionId) return null;
  if (!isCount(e.done) || !isCount(e.total) || !isCount(e.failures)) return null;
  return value as ProgressEvent;
}

/** Pure reducer: applies one ProgressEvent to the previous state of that session. */
export function applyProgressEvent(prev: SessionProgress | undefined, event: ProgressEvent, now: number): SessionProgress {
  const lastRun = event.lastRun ?? prev?.lastRun;
  let latestFailures = prev?.latestFailures ?? [];
  if (event.lastRun && NON_PASSING.has(event.lastRun.status) && !latestFailures.includes(event.lastRun.runId)) {
    latestFailures = [event.lastRun.runId, ...latestFailures].slice(0, 5);
  }
  return {
    sessionId: event.sessionId,
    project: event.project ?? prev?.project,
    // The stream carries absolute counts, so take them as-is rather than incrementing.
    done: event.done,
    total: event.total,
    failures: event.failures,
    // A session never goes back to RUNNING once completed (late/duplicate progress events).
    status: event.type === "completed" || prev?.status === "COMPLETED" ? "COMPLETED" : "RUNNING",
    lastRun,
    latestFailures,
    updatedAt: now,
  };
}

/**
 * Subscribes to Sibyl progress server-sent events.
 *
 * EventSource only retries on its own for dropped connections; a non-200 response (API down behind a
 * proxy, 404, 500) closes it for good. So every error closes the source and reconnects with capped
 * exponential backoff; a successful open resets the backoff. Everything is torn down on unmount.
 */
export function useLiveProgress(options: UseLiveProgressOptions = {}): LiveProgressState {
  const { sessionId, initialRetryMs = 1000, maxRetryMs = 30_000 } = options;
  const url = options.url ?? api.progressStreamUrl(sessionId);

  const [sessionsById, setSessionsById] = useState<Record<string, SessionProgress>>({});
  const [connection, setConnection] = useState<StreamConnection>("connecting");
  const [retryInMs, setRetryInMs] = useState<number | null>(null);

  const onCompletedRef = useRef(options.onSessionCompleted);
  useEffect(() => {
    onCompletedRef.current = options.onSessionCompleted;
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    const completedNotified = new Set<string>();

    const connect = () => {
      if (disposed) return;
      source = new EventSource(url);

      source.onopen = () => {
        attempt = 0;
        setConnection("open");
        setRetryInMs(null);
      };

      source.onmessage = (message: MessageEvent<string>) => {
        const event = parseProgressEvent(message.data);
        if (!event) return;
        const now = Date.now();
        setSessionsById((prev) => {
          const next = applyProgressEvent(prev[event.sessionId], event, now);
          return { ...prev, [event.sessionId]: next };
        });
        if (event.type === "completed" && !completedNotified.has(event.sessionId)) {
          completedNotified.add(event.sessionId);
          // Build the notification from the event itself; state updates are async.
          onCompletedRef.current?.(applyProgressEvent(undefined, event, now));
        }
      };

      source.onerror = () => {
        if (disposed) return;
        source?.close();
        source = null;
        const delay = Math.min(maxRetryMs, initialRetryMs * 2 ** attempt);
        attempt += 1;
        setConnection("reconnecting");
        setRetryInMs(delay);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [url, initialRetryMs, maxRetryMs]);

  const sessions = Object.values(sessionsById).sort((a, b) => b.updatedAt - a.updatedAt);
  return { sessions, connection, retryInMs, url };
}
