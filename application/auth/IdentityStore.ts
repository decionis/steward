import type { StewardRole } from "@/domain/auth/StewardSession";

/** A Steward user as a sign-in sees them: the row, without the hash. */
export interface SignedInUser {
  id: string;
  email: string;
  displayName: string;
  roles: StewardRole[];
}

export interface SsoUserInput {
  /** The issuer and the subject, as "<issuer>#<sub>": unique across issuers. */
  ssoSubject: string;
  email: string;
  displayName: string;
  roles: StewardRole[];
}

export interface NewSession {
  userId: string;
  expiresAt: Date;
  ssoSessionId: string | null;
  ssoIdToken: string | null;
}

export interface ActiveSession {
  id: string;
  user: SignedInUser;
  expiresAt: Date;
  ssoSessionId: string | null;
  ssoIdToken: string | null;
}

export interface ActivityInput {
  userId: string | null;
  kind: string;
  subjectReference?: string | null;
  detail?: string | null;
}

/**
 * Steward's own users, sessions and activities, as the sign-in needs them
 * (docs/Persistence.md). Implemented over the database in
 * infra/persistence and in memory for tests. Nothing here reads a password:
 * local accounts are DB2's.
 */
export interface IdentityStore {
  /** Creates the user on first sign-in, updates name, email and roles on every later one. */
  upsertSsoUser(input: SsoUserInput): Promise<SignedInUser>;
  createSession(input: NewSession): Promise<ActiveSession>;
  /** The session if it exists, has not expired and has not been revoked; else null. */
  findActiveSession(id: string): Promise<ActiveSession | null>;
  revokeSession(id: string): Promise<boolean>;
  /** Every active session that began with this issuer session; how many were revoked. */
  revokeSessionsByIssuerSession(ssoSessionId: string): Promise<number>;
  /** Every active session of the user with this SSO subject; how many were revoked. */
  revokeSessionsBySsoSubject(ssoSubject: string): Promise<number>;
  recordActivity(input: ActivityInput): Promise<void>;
}
