import jackson, { IOAuthController, JacksonOption } from '@boxyhq/saml-jackson';

export interface SSOServiceOptions {
  externalUrl: string; // e.g. https://api.sibyl.dev
  samlAudience: string;
}

export class EnterpriseSSOService {
  private oauthController: IOAuthController | null = null;
  
  constructor(private options: SSOServiceOptions) {}

  /**
   * Initializes the SAML Jackson controller.
   * In a real deployment, this requires a database (Postgres/Redis) for storing IdP configurations.
   */
  public async init() {
    const opts: JacksonOption = {
      externalUrl: this.options.externalUrl,
      samlAudience: this.options.samlAudience,
      samlPath: '/api/v1/sso/saml/acs',
      db: {
        engine: 'sql',
        type: 'postgres',
        url: process.env.POSTGRES_URI || 'postgresql://mock:mock@localhost:5432/mock',
      },
    };

    // MOCK: We catch initialization errors in v1 so the server doesn't crash without a real DB
    try {
      const { oauthController } = await jackson(opts);
      this.oauthController = oauthController;
      console.log(`[EnterpriseSSOService] Successfully initialized BoxyHQ SAML Jackson.`);
    } catch (err: any) {
      console.warn(`[EnterpriseSSOService] Mock Mode: Could not initialize real DB connection. SSO endpoints will return mock responses.`);
    }
  }

  /**
   * Generates the authorization URL to redirect the user to their Okta/Azure AD login screen.
   */
  public async authorize(tenant: string, product: string = 'sibyl') {
    if (!this.oauthController) {
      return { redirect_url: `https://mock.okta.com/login?tenant=${tenant}` };
    }

    // @ts-expect-error Type string is not assignable to type "dummy" in some boxyhq versions
    const { redirect_url } = await this.oauthController.authorize({
      tenant,
      product,
      client_id: 'tenant=' + tenant + '&product=' + product,
      redirect_uri: `${this.options.externalUrl}/api/v1/sso/callback`,
      response_type: 'code',
      state: Math.random().toString(36).substring(7),
    });

    return { redirect_url };
  }

  /**
   * Handles the callback from the IdP, verifying the SAML assertion or OIDC code,
   * and translating it into a Sibyl user profile.
   */
  public async callback(code: string, tenant: string, product: string = 'sibyl') {
    if (!this.oauthController) {
      // Mock successful login
      return {
        profile: {
          id: 'mock_sso_id',
          email: `admin@${tenant}.com`,
          firstName: 'Enterprise',
          lastName: 'Admin',
        }
      };
    }

    // @ts-expect-error Using oauthToken for auth code exchange
    const tokenRes = await this.oauthController.oauthToken({
      code,
      client_id: 'tenant=' + tenant + '&product=' + product,
      client_secret: 'dummy',
      grant_type: 'authorization_code',
      redirect_uri: `${this.options.externalUrl}/api/v1/sso/callback`,
    });

    return { profile: tokenRes };
  }
}
