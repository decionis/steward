import { randomBytes, randomUUID } from "node:crypto";
import type {
  ActiveSession,
  ActivityInput,
  IdentityStore,
  NewSession,
  SignedInUser,
  SsoUserInput,
} from "@/application/auth/IdentityStore";

interface StoredSession {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ssoSessionId: string | null;
  ssoIdToken: string | null;
}

/**
 * The identity store in memory: the same contract as the database one, for
 * tests and for a process that has no database. Nothing survives a restart,
 * which is the point of the database one.
 */
export class InMemoryIdentityStore implements IdentityStore {
  readonly users = new Map<string, SignedInUser & { ssoSubject: string }>();
  readonly sessions = new Map<string, StoredSession>();
  readonly activities: ActivityInput[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async upsertSsoUser(input: SsoUserInput): Promise<SignedInUser> {
    const existing = [...this.users.values()].find(
      (user) =>
        user.ssoSubject === input.ssoSubject || user.email === input.email,
    );
    const user = {
      id: existing?.id ?? randomUUID(),
      ssoSubject: input.ssoSubject,
      email: input.email,
      displayName: input.displayName,
      roles: [...input.roles],
    };
    this.users.set(user.id, user);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
    };
  }

  async findUserBySsoSubject(ssoSubject: string): Promise<SignedInUser | null> {
    const user = [...this.users.values()].find(
      (u) => u.ssoSubject === ssoSubject,
    );
    return user
      ? {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: [...user.roles],
        }
      : null;
  }

  async createSession(input: NewSession): Promise<ActiveSession> {
    const user = this.users.get(input.userId);
    if (!user) throw new Error(`No user ${input.userId}`);
    const session: StoredSession = {
      id: randomBytes(32).toString("base64url"),
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      ssoSessionId: input.ssoSessionId,
      ssoIdToken: input.ssoIdToken,
    };
    this.sessions.set(session.id, session);
    return this.toActive(session, user);
  }

  async findActiveSession(id: string): Promise<ActiveSession | null> {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= this.clock().getTime()) return null;
    const user = this.users.get(session.userId);
    return user ? this.toActive(session, user) : null;
  }

  async revokeSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt) return false;
    session.revokedAt = this.clock();
    return true;
  }

  async revokeSessionsByIssuerSession(ssoSessionId: string): Promise<number> {
    return this.revokeWhere((session) => session.ssoSessionId === ssoSessionId);
  }

  async revokeSessionsBySsoSubject(ssoSubject: string): Promise<number> {
    const user = [...this.users.values()].find(
      (u) => u.ssoSubject === ssoSubject,
    );
    if (!user) return 0;
    return this.revokeWhere((session) => session.userId === user.id);
  }

  async recordActivity(input: ActivityInput): Promise<void> {
    this.activities.push(input);
  }

  private revokeWhere(predicate: (session: StoredSession) => boolean): number {
    let revoked = 0;
    for (const session of this.sessions.values()) {
      if (session.revokedAt || !predicate(session)) continue;
      if (session.expiresAt.getTime() <= this.clock().getTime()) continue;
      session.revokedAt = this.clock();
      revoked += 1;
    }
    return revoked;
  }

  private toActive(session: StoredSession, user: SignedInUser): ActiveSession {
    return {
      id: session.id,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: [...user.roles],
      },
      expiresAt: session.expiresAt,
      ssoSessionId: session.ssoSessionId,
      ssoIdToken: session.ssoIdToken,
    };
  }
}
