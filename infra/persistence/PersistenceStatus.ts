import type { DatabaseDialect } from "@/infra/config/StewardRuntimeConfig";

/**
 * What the health probe reports about Steward's own database. Kept in a
 * process-wide slot with no ORM import, so a route can read it without
 * loading the database layer.
 */
export interface PersistenceStatus {
  dialect: DatabaseDialect;
  /** The embedded file, or null for a server database or an in-memory one. */
  file: string | null;
  migrated: boolean;
  pendingMigrations: number;
  appliedAtStart: string[];
}

const SLOT = Symbol.for("decionis.steward.persistence.status");

type Holder = { [SLOT]?: PersistenceStatus | null };

export function recordPersistenceStatus(
  status: PersistenceStatus | null,
): void {
  (globalThis as Holder)[SLOT] = status;
}

export function readPersistenceStatus(): PersistenceStatus | null {
  return (globalThis as Holder)[SLOT] ?? null;
}
