/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it } from "vitest";
import { recordPersistenceStatus } from "@/infra/persistence/PersistenceStatus";
import { GET } from "./route";

describe("GET /api/health", () => {
  afterEach(() => recordPersistenceStatus(null));

  it("reports liveness and no database in demo mode", async () => {
    const body = await GET().json();
    expect(body).toEqual({
      status: "ok",
      service: "decionis-steward",
      database: null,
    });
  });

  it("reports the database the server opened at start, without the applied list", async () => {
    recordPersistenceStatus({
      dialect: "sqlite",
      file: "/app/data/steward.sqlite",
      migrated: true,
      pendingMigrations: 0,
      appliedAtStart: ["InitialSchema1758800000000"],
    });

    const body = await GET().json();
    expect(body.database).toEqual({
      dialect: "sqlite",
      file: "/app/data/steward.sqlite",
      migrated: true,
      pendingMigrations: 0,
    });
  });
});
