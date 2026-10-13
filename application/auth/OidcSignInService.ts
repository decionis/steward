import type { StewardRole } from "@/domain/auth/StewardSession";
import type { OidcClient } from "@/infra/auth/oidc/OidcClient";
import { OidcFlowCookie } from "@/infra/auth/oidc/OidcFlowCookie";
import { OidcError, type UserInfoClaims } from "@/infra/auth/oidc/OidcProvider";
import { OidcRoleMapper } from "@/infra/auth/oidc/OidcRoleMapper";
import type { IdentityStore } from "./IdentityStore";

/** Why a sign-in did not complete, as the sign-in page tells the operator. */
export type SignInFailure =
  "flow_missing" | "state_mismatch" | "issuer_refused" | "token_invalid";

export class OidcSignInError extends Error {
  constructor(
    readonly reason: SignInFailure,
    message: string,
  ) {
    super(message);
    this.name = "OidcSignInError";
  }
}

export interface OidcSignInOptions {
  /** The organisation every Steward session is scoped to: the configured workspace's. */
  orgId: string;
  /** How long a Steward session lives; the realm's SSO maximum, ten hours, is the ceiling that matters. */
  sessionLifetimeMs: number;
  clock?: () => Date;
}

export const CALLBACK_PATH = "/api/auth/oidc/callback";
export const SIGN_IN_PATH = "/sign-in";

/**
 * The sign-in through kloakware, end to end: send the browser to the issuer
 * with a sealed flow, take the code back, verify the ID token, create or
 * update the user, open a Steward session; end it from either side. The
 * routes under app/api/auth/oidc are thin over this.
 */
export class OidcSignInService {
  private readonly flows: OidcFlowCookie;
  private readonly clock: () => Date;

  constructor(
    private readonly client: OidcClient,
    private readonly store: IdentityStore,
    private readonly options: OidcSignInOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.flows = new OidcFlowCookie(client.config.clientSecret, this.clock);
  }

  static redirectUri(origin: string): string {
    return `${origin}${CALLBACK_PATH}`;
  }

  /** A path inside this application, or the root: never another origin. */
  static safeReturnTo(value: string | null | undefined): string {
    if (
      !value ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.startsWith("/\\")
    ) {
      return "/";
    }
    return value;
  }

  async start(input: {
    origin: string;
    returnTo: string | null | undefined;
  }): Promise<{ authorizationUrl: string; flowCookie: string }> {
    const { authorizationUrl, flow } = await this.client.beginSignIn({
      redirectUri: OidcSignInService.redirectUri(input.origin),
      returnTo: OidcSignInService.safeReturnTo(input.returnTo),
    });
    return { authorizationUrl, flowCookie: this.flows.seal(flow) };
  }

  async complete(input: {
    origin: string;
    flowCookie: string | undefined;
    query: {
      code?: string | null;
      state?: string | null;
      error?: string | null;
      error_description?: string | null;
    };
  }): Promise<{ sessionId: string; expiresAt: Date; returnTo: string }> {
    const flow = this.flows.unseal(input.flowCookie);
    if (!flow) {
      throw new OidcSignInError(
        "flow_missing",
        "No sign-in is in progress in this browser, or it took longer than ten minutes",
      );
    }
    if (input.query.error) {
      throw new OidcSignInError(
        "issuer_refused",
        `The issuer refused the sign-in: ${input.query.error}${
          input.query.error_description
            ? ` (${input.query.error_description})`
            : ""
        }`,
      );
    }
    if (!input.query.state || input.query.state !== flow.state) {
      throw new OidcSignInError(
        "state_mismatch",
        "The sign-in that came back is not the one this browser started",
      );
    }
    if (!input.query.code) {
      throw new OidcSignInError("issuer_refused", "The issuer sent no code");
    }

    let tokens;
    try {
      tokens = await this.client.completeSignIn({
        code: input.query.code,
        redirectUri: OidcSignInService.redirectUri(input.origin),
        flow,
      });
    } catch (error) {
      if (error instanceof OidcError) {
        throw new OidcSignInError("token_invalid", error.message);
      }
      throw error;
    }

    const { claims } = tokens;
    const roles: StewardRole[] = OidcRoleMapper.fromClaims(claims);
    // The ID token says who and what; what they are called may be left to the
    // userinfo endpoint when the realm keeps its tokens lean (K4).
    let profile: UserInfoClaims = claims;
    if (!OidcRoleMapper.namesThePerson(claims) || !claims.email) {
      const info = await this.client
        .userInfo(tokens.accessToken)
        .catch(() => null);
      if (info && info.sub === claims.sub) profile = { ...claims, ...info };
    }
    const user = await this.store.upsertSsoUser({
      ssoSubject: `${this.client.config.issuerUrl}#${claims.sub}`,
      email:
        profile.email ??
        `${profile.preferred_username ?? claims.sub}@${new URL(this.client.config.issuerUrl).host}`,
      displayName: OidcRoleMapper.displayName(profile),
      roles,
    });
    const session = await this.store.createSession({
      userId: user.id,
      expiresAt: new Date(
        this.clock().getTime() + this.options.sessionLifetimeMs,
      ),
      ssoSessionId: typeof claims.sid === "string" ? claims.sid : null,
      ssoIdToken: tokens.idToken,
    });
    await this.store.recordActivity({
      userId: user.id,
      kind: "SIGNED_IN",
      detail: "kloakware",
    });
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      returnTo: flow.returnTo,
    };
  }

  /** Ends the Steward session and says where to send the browser: the issuer's end-session endpoint when there is one, else the sign-in page. */
  async signOut(input: {
    origin: string;
    sessionId: string | undefined;
  }): Promise<{ redirectTo: string }> {
    const signInPage = `${input.origin}${SIGN_IN_PATH}`;
    if (!input.sessionId) return { redirectTo: signInPage };
    const session = await this.store.findActiveSession(input.sessionId);
    const revoked = await this.store.revokeSession(input.sessionId);
    if (session && revoked) {
      await this.store.recordActivity({
        userId: session.user.id,
        kind: "SIGNED_OUT",
      });
    }
    const endSession = await this.client.endSessionUrl({
      idToken: session?.ssoIdToken ?? null,
      postLogoutRedirectUri: signInPage,
    });
    return { redirectTo: endSession ?? signInPage };
  }

  /** A backchannel logout from the issuer: every Steward session that began with that issuer session ends. */
  async endByIssuer(logoutToken: string): Promise<{ revoked: number }> {
    let claims;
    try {
      claims = await this.client.verifyLogoutToken(logoutToken);
    } catch (error) {
      if (error instanceof OidcError)
        throw new OidcSignInError("token_invalid", error.message);
      throw error;
    }
    const revoked =
      typeof claims.sid === "string"
        ? await this.store.revokeSessionsByIssuerSession(claims.sid)
        : await this.store.revokeSessionsBySsoSubject(
            `${this.client.config.issuerUrl}#${String(claims.sub)}`,
          );
    if (revoked > 0) {
      await this.store.recordActivity({
        userId: null,
        kind: "SIGNED_OUT_BY_ISSUER",
        subjectReference:
          typeof claims.sid === "string" ? claims.sid : String(claims.sub),
        detail: `${revoked} session(s)`,
      });
    }
    return { revoked };
  }

  get orgId(): string {
    return this.options.orgId;
  }
}
