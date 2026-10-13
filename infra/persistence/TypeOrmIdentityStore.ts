import { randomBytes, randomUUID } from "node:crypto";
import type { DataSource, Repository } from "typeorm";
import type {
  ActiveSession,
  ActivityInput,
  IdentityStore,
  NewSession,
  SignedInUser,
  SsoUserInput,
} from "@/application/auth/IdentityStore";
import {
  StewardRoleSchema,
  type StewardRole,
} from "@/domain/auth/StewardSession";
import {
  Activity,
  Session,
  User,
  type ActivityRecord,
  type SessionRecord,
  type UserRecord,
} from "./entities";

/**
 * The identity store over Steward's own database: `users`, `sessions` and
 * `activities`, through the portable entities. A session id is 32 random
 * bytes, URL-safe, and the only thing the browser holds.
 */
export class TypeOrmIdentityStore implements IdentityStore {
  private readonly users: Repository<UserRecord>;
  private readonly sessions: Repository<SessionRecord>;
  private readonly activities: Repository<ActivityRecord>;

  constructor(
    dataSource: DataSource,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.users = dataSource.getRepository(User);
    this.sessions = dataSource.getRepository(Session);
    this.activities = dataSource.getRepository(Activity);
  }

  async upsertSsoUser(input: SsoUserInput): Promise<SignedInUser> {
    const now = this.clock().toISOString();
    const existing =
      (await this.users.findOneBy({ ssoSubject: input.ssoSubject })) ??
      (await this.users.findOneBy({ email: input.email }));
    const record: UserRecord = existing
      ? {
          ...existing,
          ssoSubject: input.ssoSubject,
          email: input.email,
          displayName: input.displayName,
          roles: input.roles.join(","),
          updatedAt: now,
          lastSignInAt: now,
        }
      : {
          id: randomUUID(),
          email: input.email,
          displayName: input.displayName,
          passwordHash: null,
          ssoSubject: input.ssoSubject,
          roles: input.roles.join(","),
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          lastSignInAt: now,
        };
    await this.users.save(record);
    return toUser(record);
  }

  async createSession(input: NewSession): Promise<ActiveSession> {
    const user = await this.users.findOneByOrFail({ id: input.userId });
    const record: SessionRecord = {
      id: randomBytes(32).toString("base64url"),
      userId: input.userId,
      issuedAt: this.clock().toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      revokedAt: null,
      ssoSessionId: input.ssoSessionId,
      ssoIdToken: input.ssoIdToken,
    };
    await this.sessions.insert(record);
    return toSession(record, user);
  }

  async findActiveSession(id: string): Promise<ActiveSession | null> {
    const record = await this.sessions.findOneBy({ id });
    if (!record || record.revokedAt) return null;
    if (new Date(record.expiresAt).getTime() <= this.clock().getTime())
      return null;
    const user = await this.users.findOneBy({ id: record.userId });
    if (!user || user.status !== "ACTIVE") return null;
    return toSession(record, user);
  }

  async revokeSession(id: string): Promise<boolean> {
    const record = await this.sessions.findOneBy({ id });
    if (!record || record.revokedAt) return false;
    await this.sessions.update(
      { id },
      { revokedAt: this.clock().toISOString() },
    );
    return true;
  }

  async revokeSessionsByIssuerSession(ssoSessionId: string): Promise<number> {
    const open = await this.sessions.findBy({ ssoSessionId });
    return this.revokeAll(open);
  }

  async revokeSessionsBySsoSubject(ssoSubject: string): Promise<number> {
    const user = await this.users.findOneBy({ ssoSubject });
    if (!user) return 0;
    const open = await this.sessions.findBy({ userId: user.id });
    return this.revokeAll(open);
  }

  async recordActivity(input: ActivityInput): Promise<void> {
    await this.activities.insert({
      id: randomUUID(),
      userId: input.userId,
      kind: input.kind,
      subjectReference: input.subjectReference ?? null,
      occurredAt: this.clock().toISOString(),
      detail: input.detail ?? null,
    });
  }

  private async revokeAll(records: SessionRecord[]): Promise<number> {
    const now = this.clock().toISOString();
    let revoked = 0;
    for (const record of records) {
      if (record.revokedAt) continue;
      if (new Date(record.expiresAt).getTime() <= this.clock().getTime())
        continue;
      await this.sessions.update({ id: record.id }, { revokedAt: now });
      revoked += 1;
    }
    return revoked;
  }
}

function toUser(record: UserRecord): SignedInUser {
  const roles = record.roles
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is StewardRole =>
      StewardRoleSchema.options.includes(role as StewardRole),
    );
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    roles: roles.length > 0 ? roles : ["VIEWER"],
  };
}

function toSession(record: SessionRecord, user: UserRecord): ActiveSession {
  return {
    id: record.id,
    user: toUser(user),
    expiresAt: new Date(record.expiresAt),
    ssoSessionId: record.ssoSessionId,
    ssoIdToken: record.ssoIdToken,
  };
}
