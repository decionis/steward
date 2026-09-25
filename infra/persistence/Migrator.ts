import type { DataSource } from "typeorm";
import type { PersistenceConfig } from "@/infra/config/StewardRuntimeConfig";
import { PersistenceSchemaBehindError } from "./PersistenceErrors";

export interface MigrationOutcome {
  applied: string[];
  pending: number;
}

/**
 * Migrations at start (docs/Persistence.md, P5): applied when the operator
 * lets Steward run them, and refused, failing closed, when the operator runs
 * them by hand and has not yet.
 */
export async function migrate(
  dataSource: DataSource,
  mode: PersistenceConfig["migrate"],
): Promise<MigrationOutcome> {
  if (mode === "on-start") {
    const applied = await dataSource.runMigrations({ transaction: "each" });
    return { applied: applied.map((migration) => migration.name), pending: 0 };
  }
  const behind = await dataSource.showMigrations();
  if (behind) {
    const pending = await countPending(dataSource);
    throw new PersistenceSchemaBehindError(pending);
  }
  return { applied: [], pending: 0 };
}

async function countPending(dataSource: DataSource): Promise<number> {
  const runner = dataSource.createQueryRunner();
  try {
    const executed = await runner.hasTable("migrations");
    if (!executed) return dataSource.migrations.length;
    const rows = (await runner.query("SELECT name FROM migrations")) as {
      name: string;
    }[];
    const done = new Set(rows.map((row) => row.name));
    return dataSource.migrations.filter(
      (migration) => !done.has(migration.name ?? ""),
    ).length;
  } finally {
    await runner.release();
  }
}
