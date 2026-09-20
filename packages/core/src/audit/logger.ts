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

// In v1, we mock the immutable storage using an in-memory array.
// In production, this would be an append-only PostgreSQL table or a 
// write-once-read-many (WORM) storage system for strict SOC 2 compliance.
const mockStore: AuditLogEntry[] = [
  {
    id: "aud_92j102j",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    orgId: "org_default",
    actorId: "alice@acme.inc",
    actorRole: "OWNER",
    action: "api_key.created",
    resourceId: "key_77x2",
    details: { name: "CI/CD Runner" },
    ipAddress: "192.168.1.1"
  }
];

export class AuditLogger {
  
  /**
   * Records a security-relevant event to the immutable audit log.
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
    const entry: AuditLogEntry = {
      id: `aud_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      orgId,
      actorId,
      actorRole,
      action,
      resourceId,
      details,
      ipAddress
    };

    console.log(`[AuditLog] ${action} by ${actorId} (${actorRole})`);
    
    mockStore.push(entry);
    
    // Simulating async DB insert
    await new Promise(r => setTimeout(r, 10)); 
  }

  /**
   * Retrieves chronological audit logs for an organization.
   * Typically restricted to ADMIN and OWNER roles.
   */
  public static async getLogs(orgId: string): Promise<AuditLogEntry[]> {
    // Sort descending by timestamp
    return mockStore
      .filter(log => log.orgId === orgId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}
