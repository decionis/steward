/**
 * @vitest-environment node
 */

import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { OidcConfig } from "@/infra/config/StewardRuntimeConfig";
import { exportPKCS8, generateKeyPair } from "jose";
import { FakeIssuer } from "./FakeIssuer";
import { OidcClient } from "./OidcClient";
import { OidcError } from "./OidcProvider";

let issuer: FakeIssuer;

beforeAll(async () => {
  issuer = await FakeIssuer.create();
});

function client(overrides: Partial<OidcConfig> = {}) {
  const config: OidcConfig = {
    issuerUrl: issuer.issuerUrl,
    clientId: "steward",
    clientSecret: "secret-1",
    clientPrivateKey: null,
    scopes: "openid profile email",
    publicUrl: null,
    ...overrides,
  };
  return new OidcClient(config, issuer.fetch);
}

const REDIRECT = "https://steward.example/api/auth/oidc/callback";

describe("OidcClient — the authorisation request", () => {
  it("sends the browser to the issuer with the code flow, PKCE S256, a state and a nonce", async () => {
    const { authorizationUrl, flow } = await client().beginSignIn({
      redirectUri: REDIRECT,
      returnTo: "/accounts/1",
    });
    const url = new URL(authorizationUrl);

    expect(url.origin + url.pathname).toBe(
      issuer.metadata.authorization_endpoint,
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("steward");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe(flow.state);
    expect(url.searchParams.get("nonce")).toBe(flow.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256")
        .update(flow.codeVerifier, "ascii")
        .digest("base64url"),
    );
    expect(flow.returnTo).toBe("/accounts/1");
    expect(flow.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it("never reuses a state, a nonce or a verifier", async () => {
    const c = client();
    const a = (await c.beginSignIn({ redirectUri: REDIRECT, returnTo: "/" }))
      .flow;
    const b = (await c.beginSignIn({ redirectUri: REDIRECT, returnTo: "/" }))
      .flow;
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("OidcClient — the code exchange", () => {
  it("exchanges the code on the server with the secret and the verifier, and verifies the ID token", async () => {
    const c = client();
    const { flow } = await c.beginSignIn({
      redirectUri: REDIRECT,
      returnTo: "/",
    });
    const code = issuer.issueCode({
      nonce: flow.nonce,
      sub: "erin",
      claims: { name: "Erin Example" },
    });

    const { idToken, claims } = await c.completeSignIn({
      code,
      redirectUri: REDIRECT,
      flow,
    });

    const request = issuer.tokenRequests[issuer.tokenRequests.length - 1]!;
    expect(request.get("grant_type")).toBe("authorization_code");
    expect(request.get("client_secret")).toBe("secret-1");
    expect(request.get("code_verifier")).toBe(flow.codeVerifier);
    expect(request.get("redirect_uri")).toBe(REDIRECT);
    expect(idToken.split(".")).toHaveLength(3);
    expect(claims.sub).toBe("erin");
    expect(claims.name).toBe("Erin Example");
  });

  it("refuses a code the issuer does not know, and an ID token for another nonce", async () => {
    const c = client();
    const { flow } = await c.beginSignIn({
      redirectUri: REDIRECT,
      returnTo: "/",
    });
    await expect(
      c.completeSignIn({ code: "bogus", redirectUri: REDIRECT, flow }),
    ).rejects.toThrow(/refused the code: invalid_grant/);

    const foreign = issuer.issueCode({ nonce: "someone-elses-nonce" });
    await expect(
      c.completeSignIn({ code: foreign, redirectUri: REDIRECT, flow }),
    ).rejects.toThrow(OidcError);
  });

  it("builds the end-session URL with the client, the return address and the ID token hint", async () => {
    const url = new URL(
      (await client().endSessionUrl({
        idToken: "id.tok.en",
        postLogoutRedirectUri: "https://steward.example/sign-in",
      }))!,
    );
    expect(url.origin + url.pathname).toBe(
      issuer.metadata.end_session_endpoint,
    );
    expect(url.searchParams.get("client_id")).toBe("steward");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://steward.example/sign-in",
    );
    expect(url.searchParams.get("id_token_hint")).toBe("id.tok.en");
  });
});

describe("private_key_jwt, the FAPI profile's client authentication", () => {
  it("signs a client assertion with the private key instead of posting a secret", async () => {
    const { privateKey, publicKey } = await generateKeyPair("PS256", {
      extractable: true,
    });
    issuer.trustClientKey(publicKey);
    const pem = (await exportPKCS8(privateKey)).trim();
    const oidc = client({ clientSecret: null, clientPrivateKey: pem });
    const { flow } = await oidc.beginSignIn({
      redirectUri: REDIRECT,
      returnTo: "/",
    });
    const code = issuer.issueCode({ nonce: flow.nonce, sub: "u-1" });
    const tokens = await oidc.completeSignIn({
      code,
      redirectUri: REDIRECT,
      flow,
    });
    expect(tokens.claims.sub).toBe("u-1");
    const request = issuer.tokenRequests.at(-1)!;
    expect(request.get("client_secret")).toBeNull();
    expect(request.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    const assertion = issuer.clientAssertions.at(-1)!;
    expect(assertion.iss).toBe("steward");
    expect(assertion.sub).toBe("steward");
    expect(assertion.aud).toBe(issuer.issuerUrl);
    expect(typeof assertion.jti).toBe("string");
    expect((assertion.exp ?? 0) - (assertion.iat ?? 0)).toBe(60);
  });

  it("is refused when the assertion is signed with a key the issuer does not trust", async () => {
    const trusted = await generateKeyPair("PS256", { extractable: true });
    issuer.trustClientKey(trusted.publicKey);
    const other = await generateKeyPair("PS256", { extractable: true });
    const oidc = client({
      clientSecret: null,
      clientPrivateKey: (await exportPKCS8(other.privateKey)).trim(),
    });
    const { flow } = await oidc.beginSignIn({
      redirectUri: REDIRECT,
      returnTo: "/",
    });
    const code = issuer.issueCode({ nonce: flow.nonce, sub: "u-2" });
    await expect(
      oidc.completeSignIn({ code, redirectUri: REDIRECT, flow }),
    ).rejects.toBeInstanceOf(OidcError);
  });
});
