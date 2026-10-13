import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from "jose";
import type { FetchLike } from "./OidcProvider";

interface IssuerKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
  published: boolean;
}

/**
 * An OpenID Connect issuer in the test process: a discovery document, a JWKS,
 * a token endpoint that redeems the codes it issued, and signed tokens on
 * demand. Everything the client needs to be proven, nothing on the network.
 */
export class FakeIssuer {
  readonly tokenRequests: URLSearchParams[] = [];
  /** How often userinfo was read, and what it answers for the access token this issuer hands out. */
  userInfoRequests = 0;
  userInfo: Record<string, unknown> = {
    sub: "user-1",
    name: "From Userinfo",
    email: "userinfo@example.test",
  };
  readonly fetch: FetchLike;
  private readonly keys: IssuerKey[] = [];
  private readonly codes = new Map<
    string,
    { nonce: string; sub: string; claims: JWTPayload }
  >();
  private sequence = 0;

  private constructor(
    readonly issuerUrl: string,
    readonly clientId: string,
  ) {
    this.fetch = (input, init) => this.handle(input, init);
  }

  static async create(
    issuerUrl = "https://issuer.example/realms/steward",
    clientId = "steward",
  ): Promise<FakeIssuer> {
    const issuer = new FakeIssuer(issuerUrl, clientId);
    await issuer.rotateKey(true);
    return issuer;
  }

  get metadata() {
    return {
      issuer: this.issuerUrl,
      authorization_endpoint: `${this.issuerUrl}/protocol/openid-connect/auth`,
      token_endpoint: `${this.issuerUrl}/protocol/openid-connect/token`,
      jwks_uri: `${this.issuerUrl}/protocol/openid-connect/certs`,
      userinfo_endpoint: `${this.issuerUrl}/protocol/openid-connect/userinfo`,
      end_session_endpoint: `${this.issuerUrl}/protocol/openid-connect/logout`,
    };
  }

  /** A new signing key; published in the JWKS or not, to prove the refetch and the refusal. */
  async rotateKey(published = true): Promise<string> {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const kid = `key-${++this.sequence}`;
    const publicJwk = {
      ...(await exportJWK(publicKey)),
      kid,
      alg: "RS256",
      use: "sig",
    };
    this.keys.push({ kid, privateKey, publicJwk, published });
    return kid;
  }

  publish(kid: string) {
    const key = this.keys.find((k) => k.kid === kid);
    if (key) key.published = true;
  }

  /** What the authorization endpoint would hand back: a code the token endpoint redeems. */
  issueCode(input: {
    nonce: string;
    sub?: string;
    claims?: JWTPayload;
  }): string {
    const code = `code-${++this.sequence}`;
    this.codes.set(code, {
      nonce: input.nonce,
      sub: input.sub ?? "user-1",
      claims: input.claims ?? {},
    });
    return code;
  }

  async idToken(
    claims: JWTPayload & { sub: string },
    options: {
      issuer?: string;
      audience?: string;
      expiresIn?: string;
      kid?: string;
    } = {},
  ): Promise<string> {
    const key = this.key(options.kid);
    return new SignJWT({ sid: "sid-1", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
      .setIssuer(options.issuer ?? this.issuerUrl)
      .setAudience(options.audience ?? this.clientId)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? "5m")
      .sign(key.privateKey);
  }

  async logoutToken(
    claims: JWTPayload & { sid?: string; sub?: string },
    options: { withEvents?: boolean; audience?: string } = {},
  ): Promise<string> {
    const key = this.key();
    const payload: JWTPayload = { jti: `jti-${++this.sequence}`, ...claims };
    if (options.withEvents ?? true) {
      payload.events = {
        "http://schemas.openid.net/event/backchannel-logout": {},
      };
    }
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "logout+jwt" })
      .setIssuer(this.issuerUrl)
      .setAudience(options.audience ?? this.clientId)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(key.privateKey);
  }

  private key(kid?: string): IssuerKey {
    const key = kid
      ? this.keys.find((k) => k.kid === kid)
      : this.keys[this.keys.length - 1];
    if (!key) throw new Error(`No key ${kid}`);
    return key;
  }

  private async handle(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";
    if (url === `${this.issuerUrl}/.well-known/openid-configuration`)
      return json(this.metadata);
    if (url === this.metadata.userinfo_endpoint) {
      this.userInfoRequests += 1;
      const authorization = new Headers(init?.headers).get("authorization");
      if (authorization !== "Bearer access-token")
        return json({ error: "invalid_token" }, 401);
      return json(this.userInfo);
    }
    if (url === this.metadata.jwks_uri) {
      return json({
        keys: this.keys.filter((k) => k.published).map((k) => k.publicJwk),
      });
    }
    if (url === this.metadata.token_endpoint && method === "POST") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      this.tokenRequests.push(form);
      const code = this.codes.get(form.get("code") ?? "");
      if (
        !code ||
        form.get("grant_type") !== "authorization_code" ||
        form.get("client_id") !== this.clientId ||
        !form.get("client_secret") ||
        !form.get("code_verifier")
      ) {
        return json(
          { error: "invalid_grant", error_description: "Code not valid" },
          400,
        );
      }
      this.codes.delete(form.get("code") ?? "");
      const idToken = await this.idToken({
        sub: code.sub,
        nonce: code.nonce,
        ...code.claims,
      });
      return json({
        access_token: "access-token",
        id_token: idToken,
        refresh_token: "refresh-token",
        token_type: "Bearer",
        expires_in: 300,
      });
    }
    return json({ error: "not_found" }, 404);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
