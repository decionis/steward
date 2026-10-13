/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  StewardRuntimeConfig,
  type StewardDataMode,
} from "@/infra/config/StewardRuntimeConfig";
import { StewardUnauthorizedError } from "@/infra/errors/StewardErrors";
import { InMemoryIdentityStore } from "./InMemoryIdentityStore";
import { StewardSessionResolver } from "./StewardSessionResolver";

function config(
  dataMode: StewardDataMode,
  overrides: Partial<{
    serviceToken: string | null;
    withWorkspace: boolean;
  }> = {},
) {
  return new StewardRuntimeConfig({
    dataMode,
    apiBaseUrl: "https://api.decionis.com",
    serviceToken: overrides.serviceToken ?? null,
    accessTokenCookie: "decionis_access_token",
    orgIdCookie: "decionis_org_id",
    signInUrl: "https://decionis.com/sign-in",
    timeoutMs: 8_000,
    signalIngress: null,
    persistence: null,
    decionisWorkspace: overrides.withWorkspace
      ? {
          baseUrl: "https://api.decionis.com",
          apiKey: "key",
          orgId: "0f6b2a5e-7c1d-4e3f-9a8b-2c1d0e9f8a7b",
          workspaceName: "Zulu",
        }
      : null,
  });
}

function request(
  init: Partial<{
    cookies: Record<string, string>;
    headers: Record<string, string>;
  }> = {},
) {
  const cookieHeader = Object.entries(init.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return new NextRequest("https://steward.decionis.com/api/steward/portfolio", {
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(init.headers ?? {}),
    },
  });
}

const liveCookies = {
  decionis_access_token: "token-abc",
  decionis_org_id: "org-1",
};

describe("StewardSessionResolver — demo mode", () => {
  it("returns a fixture session without requiring any credential", async () => {
    const session = await new StewardSessionResolver(
      config("demo"),
    ).resolveRequestSession(request());

    expect(session.mode).toBe("DEMO");
    expect(session.accessToken).toBeNull();
    expect(session.orgId).toBe("demo-fintech");
  });

  it("grants the demo operator approval rights, so demo mode must never be production", async () => {
    // The demo session is deliberately privileged so the review flow is
    // exercisable without a Decionis tenant. StewardRuntimeConfig is what keeps this
    // out of production by defaulting NODE_ENV=production to live mode.
    const session = await new StewardSessionResolver(
      config("demo"),
    ).resolveRequestSession(request());

    expect(session.roles).toContain("ADMIN");
    expect(session.roles).toContain("APPROVER");
  });

  it("ignores any credential presented by the caller", async () => {
    const session = await new StewardSessionResolver(
      config("demo"),
    ).resolveRequestSession(
      request({
        cookies: {
          decionis_access_token: "attacker",
          decionis_org_id: "other-org",
        },
        headers: { authorization: "Bearer attacker" },
      }),
    );

    expect(session.orgId).toBe("demo-fintech");
    expect(session.accessToken).toBeNull();
  });
});

describe("StewardSessionResolver — live mode", () => {
  const resolver = new StewardSessionResolver(config("live"));

  it("rejects a request with no credential", async () => {
    await expect(resolver.resolveRequestSession(request())).rejects.toThrow(
      StewardUnauthorizedError,
    );
  });

  it("rejects a token without an organization scope", async () => {
    // Without an org id there is no tenant boundary to enforce, so a token
    // alone must not produce a session.
    await expect(
      resolver.resolveRequestSession(
        request({ cookies: { decionis_access_token: "token-abc" } }),
      ),
    ).rejects.toThrow(StewardUnauthorizedError);
  });

  it("rejects an organization scope without a token", async () => {
    await expect(
      resolver.resolveRequestSession(
        request({ cookies: { decionis_org_id: "org-1" } }),
      ),
    ).rejects.toThrow(StewardUnauthorizedError);
  });

  it("builds a live session from the handoff cookies", async () => {
    const session = await resolver.resolveRequestSession(
      request({ cookies: liveCookies }),
    );

    expect(session.mode).toBe("LIVE");
    expect(session.accessToken).toBe("token-abc");
    expect(session.orgId).toBe("org-1");
  });

  it("prefers a bearer token over the cookie", async () => {
    const session = await resolver.resolveRequestSession(
      request({
        cookies: liveCookies,
        headers: { authorization: "Bearer header-token" },
      }),
    );

    expect(session.accessToken).toBe("header-token");
  });

  it("ignores a non-bearer authorization scheme and falls back to the cookie", async () => {
    const session = await resolver.resolveRequestSession(
      request({
        cookies: liveCookies,
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      }),
    );

    expect(session.accessToken).toBe("token-abc");
  });

  it("prefers the org header over the cookie", async () => {
    const session = await resolver.resolveRequestSession(
      request({
        cookies: liveCookies,
        headers: { "x-decionis-org-id": "org-from-header" },
      }),
    );

    expect(session.orgId).toBe("org-from-header");
  });

  it("uses the service token when the caller presents none", async () => {
    const withServiceToken = new StewardSessionResolver(
      config("live", { serviceToken: "service-token" }),
    );

    const session = await withServiceToken.resolveRequestSession(
      request({ cookies: { decionis_org_id: "org-1" } }),
    );

    expect(session.accessToken).toBe("service-token");
  });
});

describe("StewardSessionResolver — role parsing", () => {
  const resolver = new StewardSessionResolver(config("live"));

  async function rolesFor(rolesCookie?: string) {
    return (
      await resolver.resolveRequestSession(
        request({
          cookies: {
            ...liveCookies,
            ...(rolesCookie === undefined
              ? {}
              : { decionis_roles: rolesCookie }),
          },
        }),
      )
    ).roles;
  }

  it("parses a comma-separated role list", async () => {
    expect(await rolesFor("APPROVER,ADMIN")).toEqual(["APPROVER", "ADMIN"]);
  });

  it("tolerates surrounding whitespace", async () => {
    expect(await rolesFor(" APPROVER , ADMIN ")).toEqual(["APPROVER", "ADMIN"]);
  });

  it("drops unrecognized roles rather than trusting them", async () => {
    expect(await rolesFor("SUPERUSER,ADMIN")).toEqual(["ADMIN"]);
  });

  it("falls back to VIEWER when no role is recognized", async () => {
    // The privilege floor. An unparseable or hostile role claim must never
    // produce an empty role set, which downstream checks could misread.
    expect(await rolesFor("root,superuser,*")).toEqual(["VIEWER"]);
  });

  it("falls back to VIEWER when the claim is absent", async () => {
    expect(await rolesFor(undefined)).toEqual(["VIEWER"]);
  });

  it("does not grant approval rights by default", async () => {
    // A session that reaches OpportunityService without an explicit APPROVER or
    // ADMIN claim must not be able to review.
    const roles = await rolesFor(undefined);

    expect(roles).not.toContain("APPROVER");
    expect(roles).not.toContain("ADMIN");
  });

  it("is case-sensitive, so a lowercase claim does not elevate", async () => {
    expect(await rolesFor("admin,approver")).toEqual(["VIEWER"]);
  });
});

describe("StewardSessionResolver — display name", () => {
  it("URL-decodes the display name from the handoff cookie", async () => {
    const session = await new StewardSessionResolver(
      config("live"),
    ).resolveRequestSession(
      request({
        cookies: { ...liveCookies, decionis_display_name: "Erin%20Example" },
      }),
    );

    expect(session.displayName).toBe("Erin Example");
  });

  it("falls back to a generic name when none is supplied", async () => {
    const session = await new StewardSessionResolver(
      config("live"),
    ).resolveRequestSession(request({ cookies: liveCookies }));

    expect(session.displayName).toBe("Decionis operator");
  });
});

describe("StewardSessionResolver — Steward's own session", () => {
  async function storeWithSession() {
    const store = new InMemoryIdentityStore();
    const user = await store.upsertSsoUser({
      ssoSubject: "https://issuer.example/realms/steward#erin",
      email: "erin@example.test",
      displayName: "Erin Example",
      roles: ["APPROVER", "OPERATIONS"],
    });
    const session = await store.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      ssoSessionId: "sid-1",
      ssoIdToken: "id.tok.en",
    });
    return { store, user, session };
  }

  it("turns the session cookie into a live session with the user's roles and the configured organisation", async () => {
    const { store, user, session } = await storeWithSession();
    const resolver = new StewardSessionResolver(
      config("live", { withWorkspace: true, serviceToken: "service-token" }),
      async () => store,
    );

    const resolved = await resolver.resolveRequestSession(
      request({ cookies: { steward_session: session.id } }),
    );

    expect(resolved.mode).toBe("LIVE");
    expect(resolved.signedInThrough).toBe("KLOAKWARE");
    expect(resolved.subject).toBe(user.id);
    expect(resolved.displayName).toBe("Erin Example");
    expect(resolved.roles).toEqual(["APPROVER", "OPERATIONS"]);
    expect(resolved.orgId).toBe("0f6b2a5e-7c1d-4e3f-9a8b-2c1d0e9f8a7b");
    expect(resolved.accessToken).toBe("service-token");
  });

  it("refuses a cookie that names no active session, even beside valid handoff cookies", async () => {
    const { store, session } = await storeWithSession();
    await store.revokeSession(session.id);
    const resolver = new StewardSessionResolver(
      config("live", { withWorkspace: true }),
      async () => store,
    );

    await expect(
      resolver.resolveRequestSession(
        request({ cookies: { ...liveCookies, steward_session: session.id } }),
      ),
    ).rejects.toThrow(StewardUnauthorizedError);
    await expect(
      resolver.resolveRequestSession(
        request({ cookies: { steward_session: "never-issued" } }),
      ),
    ).rejects.toThrow(StewardUnauthorizedError);
  });

  it("falls through to the handoff when this process has no identity store", async () => {
    const resolver = new StewardSessionResolver(config("live"));

    const resolved = await resolver.resolveRequestSession(
      request({ cookies: { ...liveCookies, steward_session: "whatever" } }),
    );

    expect(resolved.signedInThrough).toBe("DECIONIS");
    expect(resolved.accessToken).toBe("token-abc");
  });

  it("is ignored in demo mode", async () => {
    const { store, session } = await storeWithSession();
    const resolver = new StewardSessionResolver(
      config("demo"),
      async () => store,
    );

    const resolved = await resolver.resolveRequestSession(
      request({ cookies: { steward_session: session.id } }),
    );

    expect(resolved.mode).toBe("DEMO");
  });
});
