import jackson, { IDirectorySyncController, JacksonOption } from '@boxyhq/saml-jackson';

export class ScimUnavailableError extends Error {
  public statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = 'ScimUnavailableError';
  }
}

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
        url: this.requireDatabaseUrl(),
      },
    };

    try {
      const { directorySyncController } = await jackson(opts);
      this.directorySync = directorySyncController;
    } catch (err: any) {
      throw new ScimUnavailableError(`Could not initialise SCIM directory sync: ${err.message}`);
    }
  }

  public isAvailable(): boolean {
    return this.directorySync !== null;
  }

  private requireDatabaseUrl(): string {
    const url = process.env.POSTGRES_URI;
    if (!url) throw new ScimUnavailableError('SCIM needs a database: set POSTGRES_URI.');
    return url;
  }

  private requireDirectorySync(): IDirectorySyncController {
    if (!this.directorySync) {
      throw new ScimUnavailableError('SCIM is not initialised. Call init() and check it succeeded.');
    }
    return this.directorySync;
  }

  /**
   * Handles a SCIM `POST /Users` (create) or `PATCH /Users/:id` (update, including `active: false`
   * deprovisioning) by handing the raw request to Jackson's directory sync, which stores the user
   * and emits the directory event. There is no local fallback: this used to log and return a
   * random user id without storing anything, which reported success for provisioning that never
   * happened.
   */
  public async handleScimRequest(request: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    directoryId: string;
    path: string;
    body?: any;
    apiSecret: string;
  }) {
    const directorySync = this.requireDirectorySync();
    return directorySync.requests.handle({
      method: request.method,
      body: request.body,
      apiSecret: request.apiSecret,
      directoryId: request.directoryId,
      resourceType: request.path.includes('/Groups') ? 'groups' : 'users',
      resourceId: request.path.split('/').filter(Boolean)[1],
      query: {},
    });
  }
}
