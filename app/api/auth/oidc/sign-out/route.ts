import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SIGN_IN_PATH } from "@/application/auth/OidcSignInService";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

/**
 * Sign out, from Steward's side: the session row is revoked, the cookie
 * cleared, and the browser sent to the issuer's end-session endpoint so the
 * kloakware session ends too, then back to the sign-in page. A POST, from the
 * form in the app shell, so a link cannot sign anyone out.
 */
export async function POST(request: NextRequest) {
  try {
    const root = new StewardCompositionRoot();
    const origin = root.publicOrigin(request);
    const signIn = await root.createSignInService();
    const sessionId = request.cookies.get(root.config.sessionCookie)?.value;
    const redirectTo = signIn
      ? (await signIn.signOut({ origin, sessionId })).redirectTo
      : `${origin}${SIGN_IN_PATH}`;
    const response = NextResponse.redirect(redirectTo, 303);
    response.cookies.set({
      name: root.config.sessionCookie,
      value: "",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return StewardApiErrorMapper.toResponse(error);
  }
}
