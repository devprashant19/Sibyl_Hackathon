import jackson, { IOAuthController, JacksonOption } from '@boxyhq/saml-jackson';
import * as crypto from 'crypto';

export interface SSOServiceOptions {
  externalUrl: string; // e.g. https://api.sibyl.dev
  samlAudience: string;
  /** Postgres URL for Jackson's IdP configuration store. Falls back to POSTGRES_URI. */
  databaseUrl?: string;
  /** How long an authorize() state stays redeemable. Default 10 minutes. */
  stateTtlMs?: number;
}

export class SSOUnavailableError extends Error {
  public statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = 'SSOUnavailableError';
  }
}

export class SSOStateError extends Error {
  public statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SSOStateError';
  }
}

export interface SSOProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  requested?: Record<string, string>;
}

/**
 * SAML/OIDC single sign-on through BoxyHQ SAML Jackson.
 *
 * Fails closed. This used to swallow an initialisation failure and then answer every callback with
 * an `admin@<tenant>` profile, so a database outage turned SSO into "anyone is an admin". Now an
 * uninitialised service refuses both authorize() and callback().
 */
export class EnterpriseSSOService {
  private oauthController: IOAuthController | null = null;
  private pendingStates = new Map<string, { tenant: string; product: string; expiresAt: number }>();

  constructor(private options: SSOServiceOptions) {}

  public isAvailable(): boolean {
    return this.oauthController !== null;
  }

  /**
   * Initializes the SAML Jackson controller. Requires a real Postgres database; throws if it
   * cannot be reached, so the caller decides whether to start without SSO.
   */
  public async init() {
    const url = this.options.databaseUrl ?? process.env.POSTGRES_URI;
    if (!url) {
      throw new SSOUnavailableError('SSO needs a database: set POSTGRES_URI or pass databaseUrl.');
    }
    const opts: JacksonOption = {
      externalUrl: this.options.externalUrl,
      samlAudience: this.options.samlAudience,
      samlPath: '/api/v1/sso/saml/acs',
      db: { engine: 'sql', type: 'postgres', url },
    };

    try {
      const { oauthController } = await jackson(opts);
      this.oauthController = oauthController;
    } catch (err: any) {
      throw new SSOUnavailableError(`Could not initialise SAML Jackson: ${err.message}`);
    }
  }

  /**
   * Generates the authorization URL to redirect the user to their IdP login screen. The returned
   * `state` must come back unchanged on the callback.
   */
  public async authorize(tenant: string, product: string = 'sibyl') {
    const controller = this.requireController();
    this.sweepExpiredStates();

    const state = crypto.randomBytes(24).toString('base64url');
    this.pendingStates.set(state, {
      tenant,
      product,
      expiresAt: Date.now() + (this.options.stateTtlMs ?? 10 * 60_000),
    });

    // @ts-expect-error Type string is not assignable to type "dummy" in some boxyhq versions
    const { redirect_url } = await controller.authorize({
      tenant,
      product,
      client_id: 'tenant=' + tenant + '&product=' + product,
      redirect_uri: `${this.options.externalUrl}/api/v1/sso/callback`,
      response_type: 'code',
      state,
    });

    return { redirect_url, state };
  }

  /**
   * Handles the callback from the IdP: checks the state issued by authorize() (single use, bound to
   * the tenant), exchanges the code for a token, and fetches the user's profile with it.
   */
  public async callback(code: string, state: string, tenant: string, product: string = 'sibyl'): Promise<{ profile: SSOProfile }> {
    const controller = this.requireController();

    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state); // single use, whatever happens next
    if (!pending || pending.expiresAt < Date.now()) {
      throw new SSOStateError('Unknown or expired SSO state.');
    }
    if (pending.tenant !== tenant || pending.product !== product) {
      throw new SSOStateError('SSO state was issued for a different tenant.');
    }

    // @ts-expect-error Using oauthToken for auth code exchange
    const token = await controller.oauthToken({
      code,
      client_id: 'tenant=' + tenant + '&product=' + product,
      client_secret: 'dummy',
      grant_type: 'authorization_code',
      redirect_uri: `${this.options.externalUrl}/api/v1/sso/callback`,
    });

    // The token response is not a profile; the profile comes from the userinfo exchange.
    const profile = await controller.userInfo(token.access_token);
    return { profile: profile as SSOProfile };
  }

  private requireController(): IOAuthController {
    if (!this.oauthController) {
      throw new SSOUnavailableError('SSO is not initialised. Call init() and check it succeeded.');
    }
    return this.oauthController;
  }

  private sweepExpiredStates() {
    const now = Date.now();
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt < now) this.pendingStates.delete(state);
    }
  }
}
