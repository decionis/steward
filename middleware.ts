import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Two responsibilities, in this order:
 *
 *   1. Content-Security-Policy, applied to every response in every data mode.
 *      A demo deployment is public-facing and needs it as much as production.
 *   2. The Decionis session gate, applied only in live mode.
 *
 * The order matters: an unauthenticated request that gets redirected or refused
 * still receives the policy, so there is no response leaving this application
 * without one.
 */

/** Paths that must stay reachable without a Decionis session. */
const UNAUTHENTICATED_PATHS = new Set([
  "/api/health", // load balancer and uptime probes have no session
  "/sign-in", // the destination of the redirect; gating it would loop
  // Machine discovery: what Steward is, for an agent evaluating a deployment
  // before anyone has signed in. Public documentation, nothing about a tenant.
  "/llms.txt",
  "/llms-full.txt",
]);

function isLiveMode(): boolean {
  if (process.env.STEWARD_DATA_MODE)
    return process.env.STEWARD_DATA_MODE === "live";
  return process.env.NODE_ENV === "production";
}

function createNonce(): string {
  return btoa(crypto.randomUUID());
}

function buildContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";

  return [
    "default-src 'self'",
    // 'strict-dynamic' lets Next's nonced bootstrap script load its own hashed
    // chunks without enumerating them here, and makes supporting browsers ignore
    // the 'self' fallback — which is the point: no host allowlist to get wrong.
    // 'unsafe-eval' is development-only; the dev server compiles in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDevelopment ? " 'unsafe-eval'" : ""
    }`,
    // Styles are CSS Modules, emitted as external files. 'unsafe-inline' remains
    // because Next injects a small amount of inline CSS it does not nonce. It is
    // a far weaker concession than the script-src equivalent: without
    // script-src 'unsafe-inline', injected CSS cannot execute.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The browser only ever talks to this application's own BFF. It never
    // contacts the Decionis API directly — that hop is server-side.
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Belt and braces with X-Frame-Options: DENY in next.config.ts. Clickjacking
    // an operator's review controls is the attack this closes.
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applyPolicy(response: NextResponse, nonce: string): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(nonce),
  );
  return response;
}

/** Returns a blocking response, or null when the request may continue. */
function refuseUnauthenticated(request: NextRequest): NextResponse | null {
  if (!isLiveMode()) return null;
  if (UNAUTHENTICATED_PATHS.has(request.nextUrl.pathname)) return null;

  const accessTokenCookie =
    process.env.STEWARD_ACCESS_TOKEN_COOKIE ?? "decionis_access_token";
  const orgIdCookie = process.env.STEWARD_ORG_ID_COOKIE ?? "decionis_org_id";
  const hasToken = Boolean(request.cookies.get(accessTokenCookie)?.value);
  const hasOrg = Boolean(request.cookies.get(orgIdCookie)?.value);
  if (hasToken && hasOrg) return null;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "A Decionis session is required" },
      { status: 401 },
    );
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();

  const refusal = refuseUnauthenticated(request);
  if (refusal) return applyPolicy(refusal, nonce);

  // Next reads x-nonce off the request to stamp its own script tags, so the
  // nonce has to travel forward on the request as well as back on the response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  return applyPolicy(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
  );
}

export const config = {
  // sign-in is matched now — it needs the policy too — and is allowed through
  // the session gate by UNAUTHENTICATED_PATHS instead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
