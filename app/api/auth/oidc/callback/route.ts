import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  OidcSignInError,
  SIGN_IN_PATH,
} from "@/application/auth/OidcSignInService";
import { OidcFlowCookie } from "@/infra/auth/oidc/OidcFlowCookie";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";
import { notConfigured } from "../start/route";

export const dynamic = "force-dynamic";

/**
 * The browser comes back from the issuer with a code and the state. The code
 * is exchanged on the server, the ID token verified, the user created or
 * updated, and a Steward session opened: one opaque cookie, the only thing
 * the browser keeps. A sign-in that does not complete lands on the sign-in
 * page with a reason, never with a token.
 */
export async function GET(request: NextRequest) {
  const root = new StewardCompositionRoot();
  const origin = root.publicOrigin(request);
  const query = request.nextUrl.searchParams;
  try {
    const signIn = await root.createSignInService();
    if (!signIn) return notConfigured();
    const result = await signIn.complete({
      origin,
      flowCookie: request.cookies.get(OidcFlowCookie.NAME)?.value,
      query: {
        code: query.get("code"),
        state: query.get("state"),
        error: query.get("error"),
        error_description: query.get("error_description"),
      },
    });
    const response = NextResponse.redirect(
      new URL(result.returnTo, origin),
      302,
    );
    response.cookies.set({
      name: root.config.sessionCookie,
      value: result.sessionId,
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
    clearFlow(response);
    return response;
  } catch (error) {
    if (error instanceof OidcSignInError) {
      const signInPage = new URL(SIGN_IN_PATH, origin);
      signInPage.searchParams.set("error", error.reason);
      const response = NextResponse.redirect(signInPage, 302);
      clearFlow(response);
      return response;
    }
    return StewardApiErrorMapper.toResponse(error);
  }
}

function clearFlow(response: NextResponse) {
  response.cookies.set({
    name: OidcFlowCookie.NAME,
    value: "",
    path: "/api/auth/oidc",
    maxAge: 0,
  });
}
