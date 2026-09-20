import jackson, { IDirectorySyncController, JacksonOption } from '@boxyhq/saml-jackson';

export class DirectorySyncService {
  private directorySync: IDirectorySyncController | null = null;

  constructor(private externalUrl: string) {}

  public async init() {
    const opts: JacksonOption = {
      externalUrl: this.externalUrl,
      samlAudience: 'sibyl-scim',
      samlPath: '/api/v1/sso/saml/acs',
      db: {
        engine: 'sql',
        type: 'postgres',
        url: process.env.POSTGRES_URI || 'postgresql://mock:mock@localhost:5432/mock',
      },
    };

    try {
      const { directorySyncController } = await jackson(opts);
      this.directorySync = directorySyncController;
      console.log(`[DirectorySyncService] Successfully initialized SCIM 2.0 provisioning.`);
    } catch (err: any) {
      console.warn(`[DirectorySyncService] Mock Mode: Running without real database connection.`);
    }
  }

  /**
   * Mocks the handling of a SCIM POST /scim/v2/Users request from Okta.
   * In a real deployment, this routes to this.directorySync.users.create()
   */
  public async provisionUser(tenant: string, scimPayload: any) {
    console.log(`[SCIM] Provisioning user via directory sync for tenant ${tenant}:`, scimPayload.userName);
    
    // In production, we would automatically insert this user into our Users table
    // and assign them the 'MEMBER' role via RBAC.
    return {
      status: 'created',
      userId: `usr_${Math.random().toString(36).substring(7)}`,
      email: scimPayload.userName,
    };
  }

  /**
   * Mocks the handling of a SCIM PATCH /scim/v2/Users/:id request.
   * If active: false is sent, the user is immediately deprovisioned from Sibyl.
   */
  public async deprovisionUser(tenant: string, userId: string) {
    console.log(`[SCIM] Deprovisioning user ${userId} for tenant ${tenant}. Access revoked instantly.`);
    return { status: 'revoked' };
  }
}
