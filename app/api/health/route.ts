import { NextResponse } from "next/server";
import { readPersistenceStatus } from "@/infra/persistence/PersistenceStatus";

export const dynamic = "force-dynamic";

/**
 * Liveness, and what the database layer reported at start: the dialect, the
 * embedded file if any, and whether the schema is current. Null in demo
 * mode, which persists nothing.
 */
export function GET() {
  const database = readPersistenceStatus();
  return NextResponse.json({
    status: "ok",
    service: "decionis-steward",
    database: database
      ? {
          dialect: database.dialect,
          file: database.file,
          migrated: database.migrated,
          pendingMigrations: database.pendingMigrations,
        }
      : null,
  });
}
