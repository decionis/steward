import type { DataSource } from "typeorm";
import type { PersistenceConfig } from "@/infra/config/StewardRuntimeConfig";
import { migrate } from "./Migrator";
import {
  readPersistenceStatus,
  recordPersistenceStatus,
  type PersistenceStatus,
} from "./PersistenceStatus";
import { createDataSource } from "./StewardDataSource";

const SLOT = Symbol.for("decionis.steward.persistence.datasource");
type Holder = { [SLOT]?: Promise<DataSource> | undefined };

/**
 * The process-wide handle on Steward's own database: opened once at start
 * (instrumentation.ts), migrated per the operator's setting, and reported by
 * the health probe. Kept on globalThis so a development reload reuses the
 * connection instead of opening another.
 */
export class Persistence {
  static open(config: PersistenceConfig): Promise<DataSource> {
    const holder = globalThis as Holder;
    holder[SLOT] ??= Persistence.connect(config).catch((error: unknown) => {
      holder[SLOT] = undefined;
      throw error;
    });
    return holder[SLOT];
  }

  static status(): PersistenceStatus | null {
    return readPersistenceStatus();
  }

  static async close(): Promise<void> {
    const holder = globalThis as Holder;
    const pending = holder[SLOT];
    holder[SLOT] = undefined;
    recordPersistenceStatus(null);
    if (pending) {
      const dataSource = await pending.catch(() => null);
      if (dataSource?.isInitialized) await dataSource.destroy();
    }
  }

  private static async connect(config: PersistenceConfig): Promise<DataSource> {
    const dataSource = createDataSource(config);
    await dataSource.initialize();
    try {
      const outcome = await migrate(dataSource, config.migrate);
      recordPersistenceStatus({
        dialect: config.dialect,
        file: config.file === ":memory:" ? null : config.file,
        migrated: true,
        pendingMigrations: outcome.pending,
        appliedAtStart: outcome.applied,
      });
      return dataSource;
    } catch (error) {
      await dataSource.destroy();
      throw error;
    }
  }
}
