import {
  TableColumn,
  TableIndex,
  type MigrationInterface,
  type QueryRunner,
} from "typeorm";

/**
 * A sign-in through kloakware (docs/Kloakware.md, K3) leaves two things on
 * the session the first schema did not foresee: the issuer's own session id,
 * which a backchannel logout names, and the ID token, which the issuer's
 * end-session request wants back. Both nullable: a local account's session
 * has neither. Portable Table API only, as the first migration.
 */
export class SessionIssuer1760400000000 implements MigrationInterface {
  name = "SessionIssuer1760400000000";

  async up(runner: QueryRunner): Promise<void> {
    await runner.addColumns("sessions", [
      new TableColumn({
        name: "sso_session_id",
        type: "varchar",
        length: "64",
        isNullable: true,
      }),
      new TableColumn({ name: "sso_id_token", type: "text", isNullable: true }),
    ]);
    await runner.createIndex(
      "sessions",
      new TableIndex({
        name: "ix_sessions_sso",
        columnNames: ["sso_session_id"],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropIndex("sessions", "ix_sessions_sso");
    await runner.dropColumns("sessions", ["sso_session_id", "sso_id_token"]);
  }
}
