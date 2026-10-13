import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { OidcSignInError } from "@/application/auth/OidcSignInService";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";
import { notConfigured } from "../start/route";

export const dynamic = "force-dynamic";

/**
 * OpenID Connect Back-Channel Logout: the issuer posts a logout token when
 * the user's session there ends, from any application or from the admin
 * console, and every Steward session that began with it ends at once. The
 * token is verified like an ID token; a bad one is a 400 and nothing changes.
 */
export async function POST(request: NextRequest) {
  try {
    const signIn = await new StewardCompositionRoot().createSignInService();
    if (!signIn) return notConfigured();
    const form = await request.formData();
    const logoutToken = form.get("logout_token");
    if (typeof logoutToken !== "string" || !logoutToken) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "logout_token is required",
        },
        { status: 400 },
      );
    }
    const { revoked } = await signIn.endByIssuer(logoutToken);
    return NextResponse.json(
      { revoked },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof OidcSignInError) {
      return NextResponse.json(
        { error: "invalid_request", error_description: error.message },
        { status: 400 },
      );
    }
    return StewardApiErrorMapper.toResponse(error);
  }
}
