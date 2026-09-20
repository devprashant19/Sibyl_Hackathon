export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type Permission = 
  | 'manage_org'
  | 'manage_billing'
  | 'manage_api_keys'
  | 'manage_users'
  | 'manage_projects'
  | 'manage_promises'
  | 'run_simulations'
  | 'view_runs'
  | 'view_audit_logs';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    'manage_org', 'manage_billing', 'manage_api_keys', 'manage_users', 
    'manage_projects', 'manage_promises', 'run_simulations', 'view_runs', 'view_audit_logs'
  ],
  ADMIN: [
    'manage_api_keys', 'manage_users', 'manage_projects', 
    'manage_promises', 'run_simulations', 'view_runs', 'view_audit_logs'
  ],
  MEMBER: [
    'manage_promises', 'run_simulations', 'view_runs'
  ],
  VIEWER: [
    'view_runs'
  ]
};

export class AuthorizationError extends Error {
  public statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class RBAC {
  /**
   * Checks if a user's role grants them the required permission.
   * @throws AuthorizationError if the permission is denied.
   */
  public static enforce(role: Role, requiredPermission: Permission) {
    const permissions = ROLE_PERMISSIONS[role] || [];
    
    if (!permissions.includes(requiredPermission)) {
      throw new AuthorizationError(
        `Access Denied: The ${role} role does not have the '${requiredPermission}' permission.`
      );
    }
  }

  /**
   * Returns true if the role has the requested permission, without throwing.
   */
  public static hasPermission(role: Role, requiredPermission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(requiredPermission);
  }
}
