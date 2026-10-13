import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuthorizationFlow } from "./OidcClient";

/** How long a sign-in may take between the redirect out and the redirect back. */
export const FLOW_LIFETIME_MS = 10 * 60 * 1000;

/**
 * The state of a sign-in in progress, carried by the browser in a short-lived
 * HttpOnly cookie between the redirect to the issuer and the callback: the
 * state, the nonce, the PKCE verifier and where to return to. Signed with a
 * key derived from the client secret, so a value the browser did not receive
 * from this server is refused; not encrypted, because the only party holding
 * the cookie is the browser the flow belongs to, and the verifier is useless
 * without the code.
 */
export class OidcFlowCookie {
  static readonly NAME = "steward_oidc_flow";

  private readonly key: Buffer;

  constructor(
    clientSecret: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.key = createHash("sha256")
      .update(`steward-oidc-flow:${clientSecret}`)
      .digest();
  }

  seal(flow: AuthorizationFlow): string {
    const payload = Buffer.from(JSON.stringify(flow)).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }

  /** The flow, or null when the value is missing, altered, malformed or older than its lifetime. */
  unseal(value: string | undefined): AuthorizationFlow | null {
    if (!value) return null;
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return null;
    const payload = value.slice(0, dot);
    const signature = Buffer.from(value.slice(dot + 1), "base64url");
    const expected = Buffer.from(this.sign(payload), "base64url");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    ) {
      return null;
    }
    let flow: AuthorizationFlow;
    try {
      flow = JSON.parse(
        Buffer.from(payload, "base64url").toString(),
      ) as AuthorizationFlow;
    } catch {
      return null;
    }
    if (
      typeof flow.state !== "string" ||
      typeof flow.nonce !== "string" ||
      typeof flow.codeVerifier !== "string" ||
      typeof flow.returnTo !== "string" ||
      typeof flow.startedAt !== "number"
    ) {
      return null;
    }
    if (this.clock().getTime() - flow.startedAt > FLOW_LIFETIME_MS) return null;
    return flow;
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.key).update(payload).digest("base64url");
  }
}
