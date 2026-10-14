/**
 * @vitest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIssuer } from "@/infra/auth/oidc/FakeIssuer";
import { OidcClient } from "@/infra/auth/oidc/OidcClient";
import { InMemoryIdentityStore } from "@/infra/auth/InMemoryIdentityStore";
import { OidcSignInError, OidcSignInService } from "./OidcSignInService";

const ORIGIN = "https://steward.example";
const ORG = "0f6b2a5e-7c1d-4e3f-9a8b-2c1d0e9f8a7b";

let issuer: FakeIssuer;
let store: InMemoryIdentityStore;
let service: OidcSignInService;

beforeAll(async () => {
  issuer = await FakeIssuer.create();
});

beforeEach(() => {
  store = new InMemoryIdentityStore();
  service = new OidcSignInService(
    new OidcClient(
      {
        issuerUrl: issuer.issuerUrl,
        clientId: "steward",
        clientSecret: "secret",
        clientPrivateKey: null,
        scopes: "openid profile email",
        publicUrl: null,
      },
      issuer.fetch,
    ),
    store,
    { orgId: ORG, sessionLifetimeMs: 60 * 60 * 1000 },
  );
});

/** What the browser does between the two redirects: signs in at the issuer and comes back with a code. */
async function signInAtIssuer(
  authorizationUrl: string,
  claims: Record<string, unknown> = {},
  sub = "erin",
) {
  const url = new URL(authorizationUrl);
  const code = issuer.issueCode({
    nonce: url.searchParams.get("nonce")!,
    sub,
    claims: {
      email: "erin@example.test",
      name: "Erin Example",
      realm_access: {
        roles: ["steward-approver", "steward-operations", "offline_access"],
      },
      ...claims,
    },
  });
  return { code, state: url.searchParams.get("state")! };
}

describe("OidcSignInService — a sign-in, end to end", () => {
  it("opens a Steward session for the user the issuer names, with their roles, and records it", async () => {
    const start = await service.start({
      origin: ORIGIN,
      returnTo: "/accounts/9",
    });
    expect(
      new URL(start.authorizationUrl).searchParams.get("redirect_uri"),
    ).toBe(`${ORIGIN}/api/auth/oidc/callback`);
    const back = await signInAtIssuer(start.authorizationUrl);

    const done = await service.complete({
      origin: ORIGIN,
      flowCookie: start.flowCookie,
      query: back,
    });

    expect(done.returnTo).toBe("/accounts/9");
    const session = await store.findActiveSession(done.sessionId);
    expect(session?.user.displayName).toBe("Erin Example");
    expect(session?.user.email).toBe("erin@example.test");
    expect(session?.user.roles).toEqual(["APPROVER", "OPERATIONS"]);
    expect(session?.ssoSessionId).toBe("sid-1");
    expect(session?.ssoIdToken?.split(".")).toHaveLength(3);
    expect(store.activities.map((a) => a.kind)).toEqual(["SIGNED_IN"]);
  });

  it("reads the compact steward claim when the realm writes it, and the profile from userinfo when the ID token has none", async () => {
    issuer.userInfoRequests = 0;
    issuer.userInfo = {
      sub: "erin",
      name: "Erin From Userinfo",
      email: "erin.userinfo@example.test",
    };
    const start = await service.start({ origin: ORIGIN, returnTo: "/" });
    const url = new URL(start.authorizationUrl);
    const code = issuer.issueCode({
      nonce: url.searchParams.get("nonce")!,
      sub: "erin",
      claims: { steward: { roles: ["audits", "operations"], markets: ["SE"] } },
    });

    const done = await service.complete({
      origin: ORIGIN,
      flowCookie: start.flowCookie,
      query: { code, state: url.searchParams.get("state")! },
    });

    const session = await store.findActiveSession(done.sessionId);
    expect(session?.user.roles).toEqual(["AUDITS", "OPERATIONS"]);
    expect(session?.user.displayName).toBe("Erin From Userinfo");
    expect(session?.user.email).toBe("erin.userinfo@example.test");
    expect(issuer.userInfoRequests).toBe(1);
  });

  it("leaves userinfo alone when the ID token already names the person", async () => {
    issuer.userInfoRequests = 0;
    const start = await service.start({ origin: ORIGIN, returnTo: "/" });
    await service.complete({
      origin: ORIGIN,
      flowCookie: start.flowCookie,
      query: await signInAtIssuer(start.authorizationUrl),
    });
    expect(issuer.userInfoRequests).toBe(0);
  });

  it("updates the user on the next sign-in: new roles, same account", async () => {
    const first = await service.start({ origin: ORIGIN, returnTo: "/" });
    const a = await service.complete({
      origin: ORIGIN,
      flowCookie: first.flowCookie,
      query: await signInAtIssuer(first.authorizationUrl),
    });
    const second = await service.start({ origin: ORIGIN, returnTo: "/" });
    const b = await service.complete({
      origin: ORIGIN,
      flowCookie: second.flowCookie,
      query: await signInAtIssuer(second.authorizationUrl, {
        realm_access: { roles: ["steward-audits"] },
      }),
    });

    const sessionA = await store.findActiveSession(a.sessionId);
    const sessionB = await store.findActiveSession(b.sessionId);
    expect(sessionA?.user.id).toBe(sessionB?.user.id);
    expect(sessionB?.user.roles).toEqual(["AUDITS"]);
    expect(store.users.size).toBe(1);
  });

  it("returns only to a path inside Steward", async () => {
    for (const unsafe of [
      "https://evil.example/",
      "//evil.example",
      "/\\evil",
      undefined,
      "",
    ]) {
      const start = await service.start({ origin: ORIGIN, returnTo: unsafe });
      const done = await service.complete({
        origin: ORIGIN,
        flowCookie: start.flowCookie,
        query: await signInAtIssuer(start.authorizationUrl),
      });
      expect(done.returnTo).toBe("/");
    }
  });

  it("refuses a callback with no flow, with another flow's state, with an issuer error, or with a bad code", async () => {
    const start = await service.start({ origin: ORIGIN, returnTo: "/" });
    const back = await signInAtIssuer(start.authorizationUrl);

    await expect(
      service.complete({ origin: ORIGIN, flowCookie: undefined, query: back }),
    ).rejects.toMatchObject({ reason: "flow_missing" });
    await expect(
      service.complete({
        origin: ORIGIN,
        flowCookie: start.flowCookie,
        query: { ...back, state: "other" },
      }),
    ).rejects.toMatchObject({ reason: "state_mismatch" });
    await expect(
      service.complete({
        origin: ORIGIN,
        flowCookie: start.flowCookie,
        query: { error: "access_denied", error_description: "declined" },
      }),
    ).rejects.toMatchObject({ reason: "issuer_refused" });
    await expect(
      service.complete({
        origin: ORIGIN,
        flowCookie: start.flowCookie,
        query: { ...back, code: "bogus" },
      }),
    ).rejects.toMatchObject({ reason: "token_invalid" });
    expect(store.sessions.size).toBe(0);
  });

  it("refuses a code that was already redeemed", async () => {
    const start = await service.start({ origin: ORIGIN, returnTo: "/" });
    const back = await signInAtIssuer(start.authorizationUrl);
    await service.complete({
      origin: ORIGIN,
      flowCookie: start.flowCookie,
      query: back,
    });

    await expect(
      service.complete({
        origin: ORIGIN,
        flowCookie: start.flowCookie,
        query: back,
      }),
    ).rejects.toBeInstanceOf(OidcSignInError);
  });
});

describe("OidcSignInService — ending a session", () => {
  async function signedIn() {
    const start = await service.start({ origin: ORIGIN, returnTo: "/" });
    return service.complete({
      origin: ORIGIN,
      flowCookie: start.flowCookie,
      query: await signInAtIssuer(start.authorizationUrl),
    });
  }

  it("signs out from Steward's side and sends the browser to the issuer's end-session endpoint", async () => {
    const { sessionId } = await signedIn();

    const { redirectTo } = await service.signOut({ origin: ORIGIN, sessionId });

    expect(await store.findActiveSession(sessionId)).toBeNull();
    const url = new URL(redirectTo);
    expect(url.origin + url.pathname).toBe(
      issuer.metadata.end_session_endpoint,
    );
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      `${ORIGIN}/sign-in`,
    );
    expect(url.searchParams.get("id_token_hint")?.split(".")).toHaveLength(3);
    expect(store.activities.map((a) => a.kind)).toEqual([
      "SIGNED_IN",
      "SIGNED_OUT",
    ]);
  });

  it("signs out a browser with no session by sending it to the sign-in page", async () => {
    const { redirectTo } = await service.signOut({
      origin: ORIGIN,
      sessionId: undefined,
    });
    expect(redirectTo).toBe(`${ORIGIN}/sign-in`);
  });

  it("ends every session that began with the issuer session a backchannel logout names", async () => {
    const a = await signedIn();
    const b = await signedIn();

    const { revoked } = await service.endByIssuer(
      await issuer.logoutToken({ sid: "sid-1" }),
    );

    expect(revoked).toBe(2);
    expect(await store.findActiveSession(a.sessionId)).toBeNull();
    expect(await store.findActiveSession(b.sessionId)).toBeNull();
    expect(store.activities.at(-1)).toMatchObject({
      kind: "SIGNED_OUT_BY_ISSUER",
      detail: "2 session(s)",
    });
  });

  it("ends the user's sessions when the logout token names a subject instead", async () => {
    const { sessionId } = await signedIn();

    const { revoked } = await service.endByIssuer(
      await issuer.logoutToken({ sub: "erin" }),
    );

    expect(revoked).toBe(1);
    expect(await store.findActiveSession(sessionId)).toBeNull();
  });

  it("changes nothing on a logout token it cannot verify", async () => {
    const { sessionId } = await signedIn();

    await expect(service.endByIssuer("not.a.token")).rejects.toMatchObject({
      reason: "token_invalid",
    });
    await expect(
      service.endByIssuer(
        await issuer.logoutToken({ sid: "sid-1" }, { withEvents: false }),
      ),
    ).rejects.toMatchObject({ reason: "token_invalid" });
    expect(await store.findActiveSession(sessionId)).not.toBeNull();
  });
});
