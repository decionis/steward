import { Table, type MigrationInterface, type QueryRunner } from "typeorm";

/**
 * The first schema (docs/Persistence.md). Written with the portable Table
 * API and the portable column vocabulary only, so the same migration applies
 * on the embedded database today and on PostgreSQL, MySQL, SQL Server and
 * Oracle as each is wired (issues #95 to #98).
 */
const ID = { type: "varchar", length: "36" } as const;
const TIME = { type: "varchar", length: "32" } as const;

function column(
  name: string,
  spec: {
    type: string;
    length?: string;
    isNullable?: boolean;
    default?: unknown;
  },
) {
  return { name, ...spec };
}

export class InitialSchema1758800000000 implements MigrationInterface {
  name = "InitialSchema1758800000000";

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: "users",
        columns: [
          column("id", { ...ID, isPrimary: true } as never),
          column("email", { type: "varchar", length: "320" }),
          column("display_name", { type: "varchar", length: "200" }),
          column("password_hash", { type: "text", isNullable: true }),
          column("sso_subject", {
            type: "varchar",
            length: "200",
            isNullable: true,
          }),
          column("roles", { type: "varchar", length: "100" }),
          column("status", { type: "varchar", length: "20" }),
          column("created_at", TIME),
          column("updated_at", TIME),
          column("last_sign_in_at", { ...TIME, isNullable: true }),
        ],
        indices: [
          { name: "ux_users_email", columnNames: ["email"], isUnique: true },
        ],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "sessions",
        columns: [
          column("id", {
            type: "varchar",
            length: "64",
            isPrimary: true,
          } as never),
          column("user_id", ID),
          column("issued_at", TIME),
          column("expires_at", TIME),
          column("revoked_at", { ...TIME, isNullable: true }),
        ],
        indices: [{ name: "ix_sessions_user", columnNames: ["user_id"] }],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "workspaces",
        columns: [
          column("id", { ...ID, isPrimary: true } as never),
          column("name", { type: "varchar", length: "200" }),
          column("org_id", { type: "varchar", length: "100" }),
          column("api_key_ciphertext", { type: "text", isNullable: true }),
          column("connector_id", {
            type: "varchar",
            length: "100",
            isNullable: true,
          }),
          column("webhook_secret_ciphertext", {
            type: "text",
            isNullable: true,
          }),
          column("key_id", { type: "varchar", length: "64", isNullable: true }),
          column("verified_at", { ...TIME, isNullable: true }),
          column("created_by", { ...ID, isNullable: true }),
          column("created_at", TIME),
          column("updated_at", TIME),
        ],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "signal_sources",
        columns: [
          column("id", { ...ID, isPrimary: true } as never),
          column("name", { type: "varchar", length: "200" }),
          column("kind", { type: "varchar", length: "40" }),
          column("target", { type: "varchar", length: "500" }),
          column("categories", { type: "varchar", length: "200" }),
          column("enabled", { type: "boolean", default: true }),
          column("configuration", { type: "text", isNullable: true }),
          column("credential_ciphertext", { type: "text", isNullable: true }),
          column("key_id", { type: "varchar", length: "64", isNullable: true }),
          column("created_by", { ...ID, isNullable: true }),
          column("created_at", TIME),
          column("updated_at", TIME),
        ],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "signal_collections",
        columns: [
          column("id", { ...ID, isPrimary: true } as never),
          column("source_id", ID),
          column("batch_id", { type: "varchar", length: "64" }),
          column("collected_at", TIME),
          column("collected", { type: "integer", default: 0 }),
          column("accepted", { type: "integer", default: 0 }),
          column("artifact_ids", { type: "text", isNullable: true }),
          column("outcome", { type: "varchar", length: "20" }),
          column("detail", { type: "text", isNullable: true }),
        ],
        indices: [
          { name: "ix_collections_source", columnNames: ["source_id"] },
        ],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "decisions",
        columns: [
          column("id", {
            type: "varchar",
            length: "64",
            isPrimary: true,
          } as never),
          column("dossier_id", {
            type: "varchar",
            length: "64",
            isNullable: true,
          }),
          column("account_reference", { type: "varchar", length: "200" }),
          column("decision_type", { type: "varchar", length: "64" }),
          column("outcome", { type: "varchar", length: "20" }),
          column("policy_version", {
            type: "varchar",
            length: "100",
            isNullable: true,
          }),
          column("confidence_basis_points", { type: "integer", default: 0 }),
          column("mode", { type: "varchar", length: "20" }),
          column("evaluated_at", TIME),
        ],
        indices: [
          { name: "ix_decisions_account", columnNames: ["account_reference"] },
        ],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "reviews",
        columns: [
          column("id", { ...ID, isPrimary: true } as never),
          column("decision_id", { type: "varchar", length: "64" }),
          column("user_id", ID),
          column("action", { type: "varchar", length: "20" }),
          column("note", { type: "text", isNullable: true }),
          column("ledger_entry_id", {
            type: "varchar",
            length: "64",
            isNullable: true,
          }),
          column("override_id", {
            type: "varchar",
            length: "64",
            isNullable: true,
          }),
          column("recorded_at", TIME),
        ],
        indices: [
          { name: "ix_reviews_decision", columnNames: ["decision_id"] },
        ],
      }),
      true,
    );
    await runner.createTable(
      new Table({
        name: "activities",
        columns: [
          column("id", { ...ID, isPrimary: true } as never),
          column("user_id", { ...ID, isNullable: true }),
          column("kind", { type: "varchar", length: "64" }),
          column("subject_reference", {
            type: "varchar",
            length: "200",
            isNullable: true,
          }),
          column("occurred_at", TIME),
          column("detail", { type: "text", isNullable: true }),
        ],
        indices: [
          { name: "ix_activities_occurred", columnNames: ["occurred_at"] },
        ],
      }),
      true,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of [
      "activities",
      "reviews",
      "decisions",
      "signal_collections",
      "signal_sources",
      "workspaces",
      "sessions",
      "users",
    ]) {
      await runner.dropTable(table, true);
    }
  }
}
