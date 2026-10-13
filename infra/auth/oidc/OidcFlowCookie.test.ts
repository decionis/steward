/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import type { AuthorizationFlow } from "./OidcClient";
import { FLOW_LIFETIME_MS, OidcFlowCookie } from "./OidcFlowCookie";

const flow: AuthorizationFlow = {
  state: "st",
  nonce: "no",
  codeVerifier: "verifier-verifier-verifier-verifier-verifier",
  returnTo: "/accounts/9",
  startedAt: 1_700_000_000_000,
};

describe("OidcFlowCookie", () => {
  it("round-trips a flow under the secret it was sealed with", () => {
    const jar = new OidcFlowCookie(
      "secret",
      () => new Date(flow.startedAt + 1000),
    );
    expect(jar.unseal(jar.seal(flow))).toEqual(flow);
  });

  it("refuses a value sealed under another secret, an altered one, and garbage", () => {
    const sealed = new OidcFlowCookie(
      "secret",
      () => new Date(flow.startedAt),
    ).seal(flow);
    const other = new OidcFlowCookie("other", () => new Date(flow.startedAt));
    expect(other.unseal(sealed)).toBeNull();

    const jar = new OidcFlowCookie("secret", () => new Date(flow.startedAt));
    const [payload, signature] = sealed.split(".");
    const altered = Buffer.from(
      JSON.stringify({ ...flow, returnTo: "//evil.example" }),
    ).toString("base64url");
    expect(jar.unseal(`${altered}.${signature}`)).toBeNull();
    expect(jar.unseal(`${payload}.AAAA`)).toBeNull();
    expect(jar.unseal("no-dot")).toBeNull();
    expect(jar.unseal(undefined)).toBeNull();
    expect(jar.unseal("")).toBeNull();
  });

  it("refuses a flow older than its lifetime", () => {
    const sealed = new OidcFlowCookie(
      "secret",
      () => new Date(flow.startedAt),
    ).seal(flow);
    const late = new OidcFlowCookie(
      "secret",
      () => new Date(flow.startedAt + FLOW_LIFETIME_MS + 1),
    );
    expect(late.unseal(sealed)).toBeNull();
  });
});
