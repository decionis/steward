/**
 * @vitest-environment node
 */

import { beforeAll, describe, expect, it } from "vitest";
import { FakeIssuer } from "./FakeIssuer";
import { OidcError, OidcProvider } from "./OidcProvider";

let issuer: FakeIssuer;

beforeAll(async () => {
  issuer = await FakeIssuer.create();
});

function provider(clock?: () => Date) {
  return new OidcProvider(issuer.issuerUrl, issuer.fetch, clock);
}

describe("OidcProvider — discovery", () => {
  it("reads the issuer's document once and refuses one that names another issuer", async () => {
    const metadata = await provider().metadata();
    expect(metadata.token_endpoint).toBe(issuer.metadata.token_endpoint);

    const other = new OidcProvider(
      "https://other.example/realms/x",
      issuer.fetch,
    );
    await expect(other.metadata()).rejects.toThrow(/answered 404/);
  });

  it("refuses a document whose issuer differs from the configured one", async () => {
    const lying = new OidcProvider(issuer.issuerUrl, async (input) => {
      const url = String(input);
      if (url.endsWith("openid-configuration")) {
        return new Response(
          JSON.stringify({
            ...issuer.metadata,
            issuer: "https://evil.example",
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }
      return issuer.fetch(input);
    });
    await expect(lying.metadata()).rejects.toThrow(OidcError);
  });
});

describe("OidcProvider — the ID token", () => {
  it("accepts a token from the issuer, for this client, with the nonce the flow began with", async () => {
    const token = await issuer.idToken({
      sub: "u-1",
      nonce: "n-1",
      email: "e@x.test",
    });
    const claims = await provider().verifyIdToken(token, {
      clientId: "steward",
      nonce: "n-1",
    });
    expect(claims.sub).toBe("u-1");
    expect(claims.email).toBe("e@x.test");
    expect(claims.sid).toBe("sid-1");
  });

  it("refuses the wrong nonce, the wrong audience, the wrong issuer and an expired token", async () => {
    const p = provider();
    await expect(
      p.verifyIdToken(await issuer.idToken({ sub: "u", nonce: "n-1" }), {
        clientId: "steward",
        nonce: "n-2",
      }),
    ).rejects.toThrow(/nonce/);
    await expect(
      p.verifyIdToken(
        await issuer.idToken(
          { sub: "u", nonce: "n" },
          { audience: "other-app" },
        ),
        {
          clientId: "steward",
          nonce: "n",
        },
      ),
    ).rejects.toThrow(/aud/);
    await expect(
      p.verifyIdToken(
        await issuer.idToken(
          { sub: "u", nonce: "n" },
          { issuer: "https://evil.example" },
        ),
        {
          clientId: "steward",
          nonce: "n",
        },
      ),
    ).rejects.toThrow(/iss/);
    const later = provider(() => new Date(Date.now() + 60 * 60 * 1000));
    await expect(
      later.verifyIdToken(await issuer.idToken({ sub: "u", nonce: "n" }), {
        clientId: "steward",
        nonce: "n",
      }),
    ).rejects.toThrow(/expired/);
  });

  it("refuses a token signed with a key the issuer does not publish, and follows a rotation it does", async () => {
    const p = provider();
    const hidden = await issuer.rotateKey(false);
    const signedWithHidden = await issuer.idToken(
      { sub: "u", nonce: "n" },
      { kid: hidden },
    );
    await expect(
      p.verifyIdToken(signedWithHidden, { clientId: "steward", nonce: "n" }),
    ).rejects.toThrow(/does not publish/);

    issuer.publish(hidden);
    // The cache is a minute old at most before a refetch; a later clock makes it stale.
    const laterProvider = provider(() => new Date(Date.now() + 2 * 60 * 1000));
    await laterProvider.metadata();
    const claims = await laterProvider.verifyIdToken(
      await issuer.idToken(
        { sub: "u", nonce: "n" },
        { kid: hidden, expiresIn: "10m" },
      ),
      { clientId: "steward", nonce: "n" },
    );
    expect(claims.sub).toBe("u");
  });
});

describe("OidcProvider — the logout token", () => {
  it("accepts a backchannel logout token naming a session", async () => {
    const claims = await provider().verifyLogoutToken(
      await issuer.logoutToken({ sid: "sid-9" }),
      {
        clientId: "steward",
      },
    );
    expect(claims.sid).toBe("sid-9");
  });

  it("refuses one without the logout event, one with a nonce, and one naming nothing", async () => {
    const p = provider();
    await expect(
      p.verifyLogoutToken(
        await issuer.logoutToken({ sid: "s" }, { withEvents: false }),
        { clientId: "steward" },
      ),
    ).rejects.toThrow(/events/);
    await expect(
      p.verifyLogoutToken(await issuer.logoutToken({ sid: "s", nonce: "n" }), {
        clientId: "steward",
      }),
    ).rejects.toThrow(/nonce/);
    await expect(
      p.verifyLogoutToken(await issuer.logoutToken({}), {
        clientId: "steward",
      }),
    ).rejects.toThrow(/session or a subject/);
  });
});
