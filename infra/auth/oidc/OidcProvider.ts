import {
  createLocalJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";

export type FetchLike = typeof fetch;

/** The parts of the issuer's discovery document Steward uses. */
export interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

export interface IdTokenClaims extends JWTPayload {
  sub: string;
  nonce?: string;
  sid?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles?: string[] };
}

export interface LogoutTokenClaims extends JWTPayload {
  sid?: string;
  sub?: string;
  events: Record<string, unknown>;
}

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

export class OidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcError";
  }
}

/**
 * One issuer, as Steward trusts it: its discovery document and its signing
 * keys, read once and cached for the process, the keys fetched again when a
 * token names a key the cache does not hold, which is how a key rotation is
 * followed without a restart. Every token is verified here, on the server,
 * against these keys and this issuer; nothing is taken on trust from a
 * redirect.
 */
export class OidcProvider {
  private metadataPromise: Promise<OidcMetadata> | null = null;
  private keys: JSONWebKeySet | null = null;
  private keysFetchedAt = 0;

  constructor(
    readonly issuerUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  metadata(): Promise<OidcMetadata> {
    this.metadataPromise ??= this.discover().catch((error: unknown) => {
      this.metadataPromise = null;
      throw error;
    });
    return this.metadataPromise;
  }

  /** The ID token of a sign-in: issuer, audience, signature, expiry, and the nonce the flow began with. */
  async verifyIdToken(
    idToken: string,
    expected: { clientId: string; nonce: string },
  ): Promise<IdTokenClaims> {
    const payload = await this.verify(idToken, expected.clientId);
    if (payload.nonce !== expected.nonce) {
      throw new OidcError(
        "The ID token's nonce is not the one this sign-in began with",
      );
    }
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new OidcError("The ID token names no subject");
    }
    return payload as IdTokenClaims;
  }

  /** A backchannel logout token (OpenID Connect Back-Channel Logout 1.0, section 2.4). */
  async verifyLogoutToken(
    logoutToken: string,
    expected: { clientId: string },
  ): Promise<LogoutTokenClaims> {
    const payload = await this.verify(logoutToken, expected.clientId);
    const events = payload.events;
    if (
      typeof events !== "object" ||
      events === null ||
      !(BACKCHANNEL_LOGOUT_EVENT in (events as Record<string, unknown>))
    ) {
      throw new OidcError(
        "Not a backchannel logout token: the events claim is missing",
      );
    }
    if ("nonce" in payload) {
      throw new OidcError("A logout token must not carry a nonce");
    }
    if (typeof payload.sid !== "string" && typeof payload.sub !== "string") {
      throw new OidcError("A logout token names a session or a subject");
    }
    return payload as LogoutTokenClaims;
  }

  private async verify(token: string, audience: string): Promise<JWTPayload> {
    const options = {
      issuer: this.issuerUrl,
      audience,
      clockTolerance: 60,
      currentDate: this.clock(),
    };
    try {
      return (await jwtVerify(token, await this.keySet(false), options))
        .payload;
    } catch (error) {
      if (error instanceof joseErrors.JWKSNoMatchingKey) {
        // A key this process has not seen: the issuer rotated. Once a minute at most.
        try {
          return (await jwtVerify(token, await this.keySet(true), options))
            .payload;
        } catch (retried) {
          throw new OidcError(describe(retried));
        }
      }
      throw new OidcError(describe(error));
    }
  }

  private async keySet(refresh: boolean) {
    const now = this.clock().getTime();
    if (!this.keys || (refresh && now - this.keysFetchedAt > 60_000)) {
      const { jwks_uri } = await this.metadata();
      this.keys = (await this.getJson(jwks_uri)) as JSONWebKeySet;
      this.keysFetchedAt = now;
    }
    return createLocalJWKSet(this.keys);
  }

  private async discover(): Promise<OidcMetadata> {
    const document = (await this.getJson(
      `${this.issuerUrl}/.well-known/openid-configuration`,
    )) as Partial<OidcMetadata>;
    if (document.issuer !== this.issuerUrl) {
      throw new OidcError(
        `The issuer answers as ${String(document.issuer)}, not as the configured ${this.issuerUrl}`,
      );
    }
    for (const key of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
    ] as const) {
      if (typeof document[key] !== "string") {
        throw new OidcError(`The issuer's discovery document has no ${key}`);
      }
    }
    return document as OidcMetadata;
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new OidcError(`${url} answered ${response.status}`);
    }
    return response.json();
  }
}

function describe(error: unknown): string {
  if (error instanceof joseErrors.JWTExpired) return "The token has expired";
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    return `The token's ${error.claim} claim is not the expected one`;
  }
  if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
    return "The token's signature does not verify against the issuer's keys";
  }
  if (error instanceof joseErrors.JWKSNoMatchingKey) {
    return "The token was signed with a key the issuer does not publish";
  }
  return error instanceof Error ? error.message : String(error);
}
