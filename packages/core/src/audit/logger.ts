import * as crypto from 'crypto';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  orgId: string;
  actorId: string; // The user email or ID who performed the action
  actorRole: string; // The role of the actor at the time of the action
  action: string; // e.g. "api_key.created", "project.deleted"
  resourceId?: string; // The ID of the affected resource, if applicable
  details: Record<string, any>;
  ipAddress: string;
}

/** Backing store for audit entries. Must be append-only; the default keeps them in memory. */
export interface AuditLogSink {
  append(entry: Readonly<AuditLogEntry>): Promise<void>;
  list(orgId: string): Promise<AuditLogEntry[]>;
}

const MAX_IN_MEMORY_ENTRIES = 10_000;

export class InMemoryAuditLogSink implements AuditLogSink {
  private entries: Readonly<AuditLogEntry>[] = [];

  async append(entry: Readonly<AuditLogEntry>) {
    this.entries.push(entry);
    // Bounded, so a long-lived process does not grow without limit. Durable deployments should
    // supply a database-backed sink instead.
    if (this.entries.length > MAX_IN_MEMORY_ENTRIES) this.entries.shift();
  }

  async list(orgId: string) {
    return this.entries.filter(e => e.orgId === orgId).map(e => structuredClone(e) as AuditLogEntry);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

let sink: AuditLogSink = new InMemoryAuditLogSink();

export class AuditLogger {
  static setSink(next: AuditLogSink) {
    sink = next;
  }

  /**
   * Records a security-relevant event. Entries are frozen when written and copied when read, so a
   * caller cannot edit history through a reference (the old store handed out its own objects, and
   * came pre-seeded with a fabricated entry).
   */
  public static async log(
    orgId: string,
    actorId: string,
    actorRole: string,
    action: string,
    details: Record<string, any> = {},
    resourceId?: string,
    ipAddress: string = "unknown"
  ) {
    const entry: AuditLogEntry = deepFreeze({
      id: `aud_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      orgId,
      actorId,
      actorRole,
      action,
      resourceId,
      details: structuredClone(details),
      ipAddress
    });
    await sink.append(entry);
    return entry;
  }

  /**
   * Retrieves audit logs for an organization, newest first.
   * Typically restricted to ADMIN and OWNER roles.
   */
  public static async getLogs(orgId: string): Promise<AuditLogEntry[]> {
    const logs = await sink.list(orgId);
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}
