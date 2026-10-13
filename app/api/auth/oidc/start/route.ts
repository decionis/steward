import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { OidcFlowCookie } from "@/infra/auth/oidc/OidcFlowCookie";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

/**
 * The first step of a sign-in through kloakware: the browser is sent to the
 * issuer with a sealed flow in a short-lived cookie. Unauthenticated by
 * design; 404 when this deployment has no issuer configured.
 */
export async function GET(request: NextRequest) {
  try {
    const root = new StewardCompositionRoot();
    const signIn = await root.createSignInService();
    if (!signIn) return notConfigured();
    const origin = root.publicOrigin(request);
    const { authorizationUrl, flowCookie } = await signIn.start({
      origin,
      returnTo: request.nextUrl.searchParams.get("returnTo"),
    });
    const response = NextResponse.redirect(authorizationUrl, 302);
    response.cookies.set({
      name: OidcFlowCookie.NAME,
      value: flowCookie,
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/api/auth/oidc",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return StewardApiErrorMapper.toResponse(error);
  }
}

export function notConfigured() {
  return NextResponse.json(
    {
      error: "NOT_FOUND",
      message: "Sign-in through kloakware is not configured on this deployment",
    },
    { status: 404 },
  );
}
