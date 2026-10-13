import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { IdentityStore } from "@/application/auth/IdentityStore";
import {
  StewardRoleSchema,
  type StewardRole,
  type StewardSession,
} from "@/domain/auth/StewardSession";
import { StewardRuntimeConfig } from "@/infra/config/StewardRuntimeConfig";
import { StewardUnauthorizedError } from "@/infra/errors/StewardErrors";

/** Where the identity store comes from when a request needs it; null when this process has no database. */
export type IdentityStoreProvider = () => Promise<IdentityStore>;

/**
 * Who is asking. Demo mode has one fixture operator. Live mode has two
 * sources, checked in this order: Steward's own session, an opaque cookie
 * into the `sessions` table, set by a sign-in through kloakware
 * (docs/Kloakware.md); then the Decionis identity handoff's cookies, or a
 * bearer token with an org header for BFF callers. A Steward session cookie
 * that names no active session is refused outright rather than falling back:
 * the browser holding it signed out, or was signed out.
 */
export class StewardSessionResolver {
  constructor(
    private readonly config: StewardRuntimeConfig,
    private readonly identityStore: IdentityStoreProvider | null = null,
  ) {}

  async resolveServerSession(): Promise<StewardSession> {
    if (this.config.dataMode === "demo") return this.createDemoSession();

    const cookieStore = await cookies();
    const own = await this.resolveOwnSession(
      cookieStore.get(this.config.sessionCookie)?.value,
    );
    if (own) return own;

    return this.createLiveSession(
      cookieStore.get(this.config.accessTokenCookie)?.value,
      cookieStore.get(this.config.orgIdCookie)?.value,
      cookieStore.get("decionis_display_name")?.value,
      cookieStore.get("decionis_roles")?.value,
    );
  }

  async resolveRequestSession(request: NextRequest): Promise<StewardSession> {
    if (this.config.dataMode === "demo") return this.createDemoSession();

    const own = await this.resolveOwnSession(
      request.cookies.get(this.config.sessionCookie)?.value,
    );
    if (own) return own;

    const authorization = request.headers.get("authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;

    return this.createLiveSession(
      bearerToken ?? request.cookies.get(this.config.accessTokenCookie)?.value,
      request.headers.get("x-decionis-org-id") ??
        request.cookies.get(this.config.orgIdCookie)?.value,
      request.cookies.get("decionis_display_name")?.value,
      request.cookies.get("decionis_roles")?.value,
    );
  }

  private async resolveOwnSession(
    sessionId: string | undefined,
  ): Promise<StewardSession | null> {
    if (!sessionId || !this.identityStore) return null;
    const store = await this.identityStore();
    const active = await store.findActiveSession(sessionId);
    if (!active) {
      throw new StewardUnauthorizedError(
        "The Steward session has ended; sign in again",
      );
    }
    const orgId = this.config.decionisWorkspace?.orgId;
    if (!orgId) {
      throw new StewardUnauthorizedError(
        "No organisation is configured for this deployment",
      );
    }
    return {
      subject: active.user.id,
      displayName: active.user.displayName,
      orgId,
      roles: active.user.roles,
      // Until the screens move onto the published Protocol client (C3, C4),
      // the platform is read with the server-to-server credential, if any.
      accessToken: this.config.serviceToken,
      mode: "LIVE",
      signedInThrough: "KLOAKWARE",
    };
  }

  private createDemoSession(): StewardSession {
    return {
      subject: "demo-operator",
      displayName: "Erin Example",
      orgId: "demo-fintech",
      roles: ["ADMIN", "APPROVER"],
      accessToken: null,
      mode: "DEMO",
      signedInThrough: "DEMO",
    };
  }

  private createLiveSession(
    accessToken?: string,
    orgId?: string,
    displayName?: string,
    rolesValue?: string,
  ): StewardSession {
    const effectiveToken = accessToken ?? this.config.serviceToken;
    if (!effectiveToken || !orgId) throw new StewardUnauthorizedError();

    const roles = (rolesValue ?? "VIEWER")
      .split(",")
      .map((role) => role.trim())
      .filter((role): role is StewardRole =>
        StewardRoleSchema.options.includes(role as StewardRole),
      );

    return {
      subject: "decionis-user",
      displayName: displayName
        ? decodeURIComponent(displayName)
        : "Decionis operator",
      orgId,
      roles: roles.length > 0 ? roles : ["VIEWER"],
      accessToken: effectiveToken,
      mode: "LIVE",
      signedInThrough: "DECIONIS",
    };
  }
}
