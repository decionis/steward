import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

/**
 * Who the current session is, without a token in it: for the shell and for
 * the end-to-end test. Resolves the session only, never the platform
 * repository, so it answers for a session that cannot yet read the platform.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await new StewardCompositionRoot().resolveRequestSession(
      request,
    );
    return NextResponse.json(
      {
        subject: session.subject,
        displayName: session.displayName,
        orgId: session.orgId,
        roles: session.roles,
        mode: session.mode,
        signedInThrough: session.signedInThrough ?? null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return StewardApiErrorMapper.toResponse(error);
  }
}
