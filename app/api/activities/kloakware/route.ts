import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  KloakwareAuditWebhook,
  KloakwareAuditWebhookError,
} from "@/infra/auth/audit/KloakwareAuditWebhook";
import { StewardApiErrorMapper } from "@/infra/api/StewardApiErrorMapper";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

/**
 * Where kloakware's audit listener posts each record: a sign-in, a failed
 * sign-in, a sign-out, a password change, an admin operation. Verified under
 * the shared secret with a five-minute replay window, then kept as an
 * activity, attributed to the Steward user who signs in as that issuer
 * subject when there is one. 404 when no secret is configured; 401 when the
 * signature does not verify; nothing is kept in either case.
 */
export async function POST(request: NextRequest) {
  try {
    const root = new StewardCompositionRoot();
    const secret = root.config.auditWebhookSecret;
    const store = await root.identityStoreOrNull();
    if (!secret || !store) {
      return NextResponse.json(
        {
          error: "NOT_FOUND",
          message:
            "The kloakware audit endpoint is not configured on this deployment",
        },
        { status: 404 },
      );
    }
    const body = await request.text();
    const record = new KloakwareAuditWebhook(secret).verify({
      timestamp: request.headers.get("x-steward-timestamp"),
      signature: request.headers.get("x-steward-signature"),
      body,
    });
    const issuer = root.config.oidc?.issuerUrl ?? null;
    const user =
      issuer && record.userId && issuer.endsWith(`/realms/${record.realm}`)
        ? await store.findUserBySsoSubject(`${issuer}#${record.userId}`)
        : null;
    const activity = KloakwareAuditWebhook.toActivity(record);
    await store.recordActivity({
      userId: user?.id ?? null,
      kind: activity.kind,
      subjectReference: activity.subjectReference,
      detail: activity.detail,
    });
    return NextResponse.json(
      { recorded: true },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof KloakwareAuditWebhookError) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: error.message },
        { status: 401 },
      );
    }
    return StewardApiErrorMapper.toResponse(error);
  }
}
