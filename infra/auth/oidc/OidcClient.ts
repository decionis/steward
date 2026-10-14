import { SignJWT } from "jose";
import { createHash, createPrivateKey, randomBytes } from "node:crypto";
import type { OidcConfig } from "@/infra/config/StewardRuntimeConfig";
import {
  OidcError,
  OidcProvider,
  type FetchLike,
  type IdTokenClaims,
  type LogoutTokenClaims,
  type UserInfoClaims,
} from "./OidcProvider";

/** What the browser is sent away with, and what must come back unchanged. */
export interface AuthorizationFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  startedAt: number;
}

export interface SignInTokens {
  idToken: string;
  /** Kept only for the userinfo request that may follow; never stored. */
  accessToken: string;
  claims: IdTokenClaims;
}

/**
 * Steward as a confidential OpenID Connect client: the Authorization Code
 * flow with PKCE (S256), the code exchanged on the server with the client
 * secret, the ID token verified before anything is believed. The browser
 * carries a redirect and a code; it never sees a token.
 */
export class OidcClient {
  readonly provider: OidcProvider;
  private readonly fetchImpl: FetchLike;

  constructor(
    readonly config: OidcConfig,
    fetchImpl: FetchLike = fetch,
    private readonly clock: () => Date = () => new Date(),
    private readonly random: (bytes: number) => Buffer = randomBytes,
  ) {
    this.provider = new OidcProvider(config.issuerUrl, fetchImpl, clock);
    this.fetchImpl = fetchImpl;
  }

  async beginSignIn(input: {
    redirectUri: string;
    returnTo: string;
  }): Promise<{ authorizationUrl: string; flow: AuthorizationFlow }> {
    const flow: AuthorizationFlow = {
      state: this.random(16).toString("base64url"),
      nonce: this.random(16).toString("base64url"),
      codeVerifier: this.random(32).toString("base64url"),
      returnTo: input.returnTo,
      startedAt: this.clock().getTime(),
    };
    const { authorization_endpoint } = await this.provider.metadata();
    const url = new URL(authorization_endpoint);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.config.scopes);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("state", flow.state);
    url.searchParams.set("nonce", flow.nonce);
    url.searchParams.set("code_challenge", challenge(flow.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    return { authorizationUrl: url.toString(), flow };
  }

  async completeSignIn(input: {
    code: string;
    redirectUri: string;
    flow: AuthorizationFlow;
  }): Promise<SignInTokens> {
    const { token_endpoint } = await this.provider.metadata();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.config.clientId,
      code_verifier: input.flow.codeVerifier,
      ...(await this.clientAuthentication()),
    });
    const response = await this.fetchImpl(token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });
    const payload = (await response.json().catch(() => null)) as {
      id_token?: unknown;
      access_token?: unknown;
      error?: unknown;
      error_description?: unknown;
    } | null;
    if (
      !response.ok ||
      typeof payload?.id_token !== "string" ||
      typeof payload.access_token !== "string"
    ) {
      throw new OidcError(
        `The issuer refused the code: ${String(payload?.error ?? response.status)}${
          payload?.error_description
            ? ` (${String(payload.error_description)})`
            : ""
        }`,
      );
    }
    const claims = await this.provider.verifyIdToken(payload.id_token, {
      clientId: this.config.clientId,
      nonce: input.flow.nonce,
    });
    return {
      idToken: payload.id_token,
      accessToken: payload.access_token,
      claims,
    };
  }

  /**
   * How the client proves itself at the token endpoint: the secret, posted,
   * or a client assertion signed with the private key (private_key_jwt, as
   * the FAPI profile requires): the client as issuer and subject, the issuer
   * as audience, a minute to live, PS256 for an RSA key and ES256 for an EC
   * one, which are the algorithms the profile allows.
   */
  private async clientAuthentication(): Promise<Record<string, string>> {
    if (this.config.clientPrivateKey) {
      const key = createPrivateKey(this.config.clientPrivateKey);
      const alg = key.asymmetricKeyType === "ec" ? "ES256" : "PS256";
      const now = Math.floor(this.clock().getTime() / 1000);
      const assertion = await new SignJWT({})
        .setProtectedHeader({ alg, typ: "JWT" })
        .setIssuer(this.config.clientId)
        .setSubject(this.config.clientId)
        .setAudience(this.config.issuerUrl)
        .setJti(this.random(16).toString("base64url"))
        .setIssuedAt(now)
        .setExpirationTime(now + 60)
        .sign(key);
      return {
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion,
      };
    }
    return { client_secret: this.config.clientSecret ?? "" };
  }

  /**
   * The profile from the userinfo endpoint, for an access token that carries
   * none: a lightweight access token says who, not what they are called. Null
   * when the issuer has no userinfo endpoint.
   */
  async userInfo(accessToken: string): Promise<UserInfoClaims | null> {
    const { userinfo_endpoint } = await this.provider.metadata();
    if (!userinfo_endpoint) return null;
    const response = await this.fetchImpl(userinfo_endpoint, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new OidcError(`The userinfo endpoint answered ${response.status}`);
    }
    const claims = (await response.json()) as UserInfoClaims;
    if (typeof claims.sub !== "string") {
      throw new OidcError("The userinfo endpoint named no subject");
    }
    return claims;
  }

  verifyLogoutToken(logoutToken: string): Promise<LogoutTokenClaims> {
    return this.provider.verifyLogoutToken(logoutToken, {
      clientId: this.config.clientId,
    });
  }

  /** Where to send the browser to end the issuer's session too; null when the issuer has no end-session endpoint. */
  async endSessionUrl(input: {
    idToken: string | null;
    postLogoutRedirectUri: string;
  }): Promise<string | null> {
    const { end_session_endpoint } = await this.provider.metadata();
    if (!end_session_endpoint) return null;
    const url = new URL(end_session_endpoint);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set(
      "post_logout_redirect_uri",
      input.postLogoutRedirectUri,
    );
    if (input.idToken) url.searchParams.set("id_token_hint", input.idToken);
    return url.toString();
  }
}

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}
