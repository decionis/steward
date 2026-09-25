import { EntitySchema } from "typeorm";
import { count, flag, id, label, reference, text, timestamp } from "./Columns";

/**
 * Steward's own records (docs/Persistence.md, "What is stored, and what is
 * not"): its users and sessions, the Decionis workspace connection, the
 * signal sources it is configured with and their collections, the decisions
 * it showed and the reviews its operators recorded, and their activities.
 * Never the content of a signal. Credentials are ciphertext under a key id.
 */
export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  ssoSubject: string | null;
  roles: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
}
export const User = new EntitySchema<UserRecord>({
  name: "User",
  tableName: "users",
  columns: {
    id: id(),
    email: label("email", 320),
    displayName: label("display_name"),
    passwordHash: text("password_hash", true),
    ssoSubject: label("sso_subject", 200, true),
    roles: label("roles", 100),
    status: label("status", 20),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    lastSignInAt: timestamp("last_sign_in_at", true),
  },
  indices: [{ name: "ux_users_email", columns: ["email"], unique: true }],
});

export interface SessionRecord {
  id: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
export const Session = new EntitySchema<SessionRecord>({
  name: "Session",
  tableName: "sessions",
  columns: {
    id: { type: "varchar", length: 64, primary: true },
    userId: reference("user_id"),
    issuedAt: timestamp("issued_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at", true),
  },
  indices: [{ name: "ix_sessions_user", columns: ["userId"] }],
});

export interface WorkspaceRecord {
  id: string;
  name: string;
  orgId: string;
  apiKeyCiphertext: string | null;
  connectorId: string | null;
  webhookSecretCiphertext: string | null;
  keyId: string | null;
  verifiedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export const Workspace = new EntitySchema<WorkspaceRecord>({
  name: "Workspace",
  tableName: "workspaces",
  columns: {
    id: id(),
    name: label("name"),
    orgId: label("org_id", 100),
    apiKeyCiphertext: text("api_key_ciphertext", true),
    connectorId: label("connector_id", 100, true),
    webhookSecretCiphertext: text("webhook_secret_ciphertext", true),
    keyId: label("key_id", 64, true),
    verifiedAt: timestamp("verified_at", true),
    createdBy: reference("created_by", true),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
});

export interface SignalSourceRecord {
  id: string;
  name: string;
  kind: string;
  target: string;
  categories: string;
  enabled: boolean;
  configuration: string | null;
  credentialCiphertext: string | null;
  keyId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export const SignalSource = new EntitySchema<SignalSourceRecord>({
  name: "SignalSource",
  tableName: "signal_sources",
  columns: {
    id: id(),
    name: label("name"),
    kind: label("kind", 40),
    target: label("target", 500),
    categories: label("categories", 200),
    enabled: flag("enabled", true),
    configuration: text("configuration", true),
    credentialCiphertext: text("credential_ciphertext", true),
    keyId: label("key_id", 64, true),
    createdBy: reference("created_by", true),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
});

export interface SignalCollectionRecord {
  id: string;
  sourceId: string;
  batchId: string;
  collectedAt: string;
  collected: number;
  accepted: number;
  artifactIds: string | null;
  outcome: string;
  detail: string | null;
}
export const SignalCollection = new EntitySchema<SignalCollectionRecord>({
  name: "SignalCollection",
  tableName: "signal_collections",
  columns: {
    id: id(),
    sourceId: reference("source_id"),
    batchId: label("batch_id", 64),
    collectedAt: timestamp("collected_at"),
    collected: count("collected"),
    accepted: count("accepted"),
    artifactIds: text("artifact_ids", true),
    outcome: label("outcome", 20),
    detail: text("detail", true),
  },
  indices: [{ name: "ix_collections_source", columns: ["sourceId"] }],
});

export interface DecisionRecord {
  id: string;
  dossierId: string | null;
  accountReference: string;
  decisionType: string;
  outcome: string;
  policyVersion: string | null;
  confidenceBasisPoints: number;
  mode: string;
  evaluatedAt: string;
}
export const Decision = new EntitySchema<DecisionRecord>({
  name: "Decision",
  tableName: "decisions",
  columns: {
    id: { type: "varchar", length: 64, primary: true },
    dossierId: label("dossier_id", 64, true),
    accountReference: label("account_reference", 200),
    decisionType: label("decision_type", 64),
    outcome: label("outcome", 20),
    policyVersion: label("policy_version", 100, true),
    confidenceBasisPoints: count("confidence_basis_points"),
    mode: label("mode", 20),
    evaluatedAt: timestamp("evaluated_at"),
  },
  indices: [{ name: "ix_decisions_account", columns: ["accountReference"] }],
});

export interface ReviewRecord {
  id: string;
  decisionId: string;
  userId: string;
  action: string;
  note: string | null;
  ledgerEntryId: string | null;
  overrideId: string | null;
  recordedAt: string;
}
export const Review = new EntitySchema<ReviewRecord>({
  name: "Review",
  tableName: "reviews",
  columns: {
    id: id(),
    decisionId: { name: "decision_id", type: "varchar", length: 64 },
    userId: reference("user_id"),
    action: label("action", 20),
    note: text("note", true),
    ledgerEntryId: label("ledger_entry_id", 64, true),
    overrideId: label("override_id", 64, true),
    recordedAt: timestamp("recorded_at"),
  },
  indices: [{ name: "ix_reviews_decision", columns: ["decisionId"] }],
});

export interface ActivityRecord {
  id: string;
  userId: string | null;
  kind: string;
  subjectReference: string | null;
  occurredAt: string;
  detail: string | null;
}
export const Activity = new EntitySchema<ActivityRecord>({
  name: "Activity",
  tableName: "activities",
  columns: {
    id: id(),
    userId: reference("user_id", true),
    kind: label("kind", 64),
    subjectReference: label("subject_reference", 200, true),
    occurredAt: timestamp("occurred_at"),
    detail: text("detail", true),
  },
  indices: [{ name: "ix_activities_occurred", columns: ["occurredAt"] }],
});

export const ENTITIES = [
  User,
  Session,
  Workspace,
  SignalSource,
  SignalCollection,
  Decision,
  Review,
  Activity,
];
