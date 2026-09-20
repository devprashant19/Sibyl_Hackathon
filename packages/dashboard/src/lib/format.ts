import type { CapturedEvent, FaultSchedule } from "./api-types";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function toDate(ms: number | null | undefined): Date | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Deterministic UTC formatting. `toLocale*String()` differs between the server and the browser
 * (locale and time zone), which causes hydration mismatches; these helpers never do.
 */
export function formatDateTimeUtc(ms: number | null | undefined): string {
  const d = toDate(ms);
  if (!d) return "—";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function formatTimeUtc(ms: number | null | undefined): string {
  const d = toDate(ms);
  if (!d) return "—";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

export function formatDateUtc(ms: number | null | undefined): string {
  const d = toDate(ms);
  if (!d) return "—";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${pad(seconds)}s`;
}

/** Locale-independent thousands separator (e.g. 12,345). */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function shortId(id: string, length = 8): string {
  return id.length > length + 1 ? id.slice(0, length) : id;
}

/** One-line, human-readable summary of an event payload, by domain. */
export function summarizeEvent(event: CapturedEvent): string {
  switch (event.domain) {
    case "HTTP": {
      const p = event.payload;
      return `${p.method} ${p.url} → ${p.statusCode} (${formatDuration(p.durationMs)})`;
    }
    case "DATABASE":
      return `${event.payload.query} (${formatDuration(event.payload.durationMs)})`;
    case "MESSAGE_QUEUE":
      return `${event.payload.topic} · message ${event.payload.messageId}`;
    case "GRPC":
      return `${event.payload.method} → status ${event.payload.statusCode}`;
    case "FILESYSTEM":
      return `${event.payload.operation} ${event.payload.path}`;
    case "CLOCK": {
      const skew = event.payload.skewedTime - event.payload.originalTime;
      return `clock skewed ${skew >= 0 ? "+" : ""}${skew}ms`;
    }
    case "PROCESS":
      return `pid ${event.payload.pid}${event.payload.signal ? ` · ${event.payload.signal}` : ""}`;
    case "MEMORY":
    case "CPU":
      return `utilization ${event.payload.utilization}%`;
    default: {
      // Forward-compatibility: a domain this dashboard does not know yet.
      const unknownEvent = event as { payload?: unknown };
      try {
        return JSON.stringify(unknownEvent.payload ?? {});
      } catch {
        return "(unserializable payload)";
      }
    }
  }
}

/** Fault-specific parameters other than delayMs, e.g. HTTP status or clock offset. */
export function scheduleDetails(schedule: FaultSchedule): string {
  const spec = schedule.spec as Record<string, unknown>;
  const parts = Object.entries(spec)
    .filter(([key, value]) => !["domain", "type", "delayMs"].includes(key) && value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.join(", ");
}

export function scheduleDelayMs(schedule: FaultSchedule): number | undefined {
  const delay = (schedule.spec as { delayMs?: unknown }).delayMs;
  return typeof delay === "number" ? delay : undefined;
}
