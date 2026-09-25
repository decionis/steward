/** A database dialect the operator named that this build does not wire yet. */
export class PersistenceUnsupportedDialectError extends Error {
  constructor(dialect: string, issue: string) {
    super(
      `The ${dialect} database is not wired in this build yet; the embedded database works today, and ${dialect} is tracked at ${issue}`,
    );
    this.name = "PersistenceUnsupportedDialectError";
  }
}

/** Migrations are pending and the operator asked Steward not to run them. */
export class PersistenceSchemaBehindError extends Error {
  constructor(pending: number) {
    super(
      `The database schema is behind by ${pending} migration${pending === 1 ? "" : "s"} and STEWARD_DATABASE_MIGRATE=off; run pnpm db:migrate, or set STEWARD_DATABASE_MIGRATE=on-start`,
    );
    this.name = "PersistenceSchemaBehindError";
  }
}
