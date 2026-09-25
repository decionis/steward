import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DataSource } from "typeorm";
import type { PersistenceConfig } from "@/infra/config/StewardRuntimeConfig";
import { ENTITIES } from "./entities";
import { MIGRATIONS } from "./migrations";
import { PersistenceUnsupportedDialectError } from "./PersistenceErrors";

/** Where each server dialect is tracked until it is wired. */
export const DIALECT_ISSUES = {
  postgres: "https://github.com/decionis/steward/issues/95",
  mysql: "https://github.com/decionis/steward/issues/96",
  mssql: "https://github.com/decionis/steward/issues/97",
  oracle: "https://github.com/decionis/steward/issues/98",
} as const;

/**
 * One data source per process, built from the configuration. `synchronize`
 * is never on: the schema changes only through migrations, so what runs in
 * production is what was reviewed.
 */
export function createDataSource(config: PersistenceConfig): DataSource {
  if (config.dialect === "sqlite") {
    const file = config.file ?? ":memory:";
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    return new DataSource({
      type: "better-sqlite3",
      database: file,
      entities: ENTITIES,
      migrations: MIGRATIONS,
      synchronize: false,
      logging: false,
    });
  }
  throw new PersistenceUnsupportedDialectError(
    config.dialect,
    DIALECT_ISSUES[config.dialect],
  );
}
