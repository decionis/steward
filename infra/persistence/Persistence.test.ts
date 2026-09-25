/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it } from "vitest";
import type { PersistenceConfig } from "@/infra/config/StewardRuntimeConfig";
import { ENTITIES } from "./entities";
import { migrate } from "./Migrator";
import { Persistence } from "./Persistence";
import {
  PersistenceSchemaBehindError,
  PersistenceUnsupportedDialectError,
} from "./PersistenceErrors";
import { createDataSource } from "./StewardDataSource";

const memory: PersistenceConfig = {
  dialect: "sqlite",
  url: null,
  file: ":memory:",
  migrate: "on-start",
};

const TABLES = [
  "users",
  "sessions",
  "workspaces",
  "signal_sources",
  "signal_collections",
  "decisions",
  "reviews",
  "activities",
];

describe("The schema and its migration", () => {
  afterEach(() => Persistence.close());

  it("creates every table from empty, then re-applies as a no-op", async () => {
    const dataSource = createDataSource(memory);
    await dataSource.initialize();

    const first = await migrate(dataSource, "on-start");
    const again = await migrate(dataSource, "on-start");
    const names = (
      (await dataSource.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )) as { name: string }[]
    ).map((row) => row.name);

    expect(first.applied).toEqual(["InitialSchema1758800000000"]);
    expect(again.applied).toEqual([]);
    for (const table of TABLES) expect(names).toContain(table);
    await dataSource.destroy();
  });

  it("agrees with the entities: every record type round-trips through its table", async () => {
    const dataSource = await Persistence.open(memory);
    const now = new Date().toISOString();
    const samples: Record<string, object> = {
      User: {
        id: "u1",
        email: "erin.example@steward.invalid",
        displayName: "Erin Example",
        passwordHash: null,
        ssoSubject: "sso-erin",
        roles: "ADMIN,APPROVER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        lastSignInAt: null,
      },
      Session: {
        id: "s1",
        userId: "u1",
        issuedAt: now,
        expiresAt: now,
        revokedAt: null,
      },
      Workspace: {
        id: "w1",
        name: "Zulu Financial",
        orgId: "org-zulu",
        apiKeyCiphertext: "ciphertext",
        connectorId: "conn-zulu",
        webhookSecretCiphertext: null,
        keyId: "k1",
        verifiedAt: null,
        createdBy: "u1",
        createdAt: now,
        updatedAt: now,
      },
      SignalSource: {
        id: "src1",
        name: "CRM",
        kind: "CRM",
        target: "crm.demo (fixture)",
        categories: "CRM",
        enabled: true,
        configuration: null,
        credentialCiphertext: null,
        keyId: null,
        createdBy: "u1",
        createdAt: now,
        updatedAt: now,
      },
      SignalCollection: {
        id: "c1",
        sourceId: "src1",
        batchId: "b1",
        collectedAt: now,
        collected: 2,
        accepted: 2,
        artifactIds: '["a1","a2"]',
        outcome: "ACCEPTED",
        detail: null,
      },
      Decision: {
        id: "eval-1",
        dossierId: "dossier-1",
        accountReference: "CRM-DEMO-0001",
        decisionType: "PROCESSING_LIMIT_REVIEW",
        outcome: "ESCALATE",
        policyVersion: "customer_ops.v4",
        confidenceBasisPoints: 9100,
        mode: "SHADOW",
        evaluatedAt: now,
      },
      Review: {
        id: "r1",
        decisionId: "eval-1",
        userId: "u1",
        action: "HOLD",
        note: "Wait for the KYB refresh.",
        ledgerEntryId: null,
        overrideId: "ovr-1",
        recordedAt: now,
      },
      Activity: {
        id: "a1",
        userId: "u1",
        kind: "REVIEWED",
        subjectReference: "eval-1",
        occurredAt: now,
        detail: null,
      },
    };

    for (const entity of ENTITIES) {
      const repository = dataSource.getRepository(entity);
      const sample = samples[entity.options.name];
      if (!sample) throw new Error(`no sample for ${entity.options.name}`);
      await repository.save(sample);
      const stored = await repository.findOneByOrFail({
        id: (sample as { id: string }).id,
      });
      expect(stored, entity.options.name).toEqual(sample);
    }
  });

  it("refuses to serve a schema that is behind when the operator runs migrations by hand", async () => {
    const dataSource = createDataSource(memory);
    await dataSource.initialize();

    await expect(migrate(dataSource, "off")).rejects.toBeInstanceOf(
      PersistenceSchemaBehindError,
    );
    await expect(migrate(dataSource, "off")).rejects.toThrow(
      /behind by 1 migration/,
    );
    await dataSource.destroy();
  });

  it("accepts an up-to-date schema when migrations are off", async () => {
    const dataSource = createDataSource(memory);
    await dataSource.initialize();
    await migrate(dataSource, "on-start");

    await expect(migrate(dataSource, "off")).resolves.toEqual({
      applied: [],
      pending: 0,
    });
    await dataSource.destroy();
  });

  it("names the issue that tracks a dialect this build does not wire", () => {
    expect(() =>
      createDataSource({
        dialect: "postgres",
        url: "postgres://steward@db/steward",
        file: null,
        migrate: "on-start",
      }),
    ).toThrow(PersistenceUnsupportedDialectError);
    expect(() =>
      createDataSource({
        dialect: "oracle",
        url: "oracle://db/x",
        file: null,
        migrate: "off",
      }),
    ).toThrow(/issues\/98/);
  });
});

describe("Persistence — the process-wide handle", () => {
  afterEach(() => Persistence.close());

  it("opens once, reports its status for the health probe, and reuses the connection", async () => {
    const first = await Persistence.open(memory);
    const second = await Persistence.open(memory);

    expect(second).toBe(first);
    expect(Persistence.status()).toEqual({
      dialect: "sqlite",
      file: null,
      migrated: true,
      pendingMigrations: 0,
      appliedAtStart: ["InitialSchema1758800000000"],
    });
  });

  it("reports nothing after close, and a failed open leaves no handle behind", async () => {
    await expect(
      Persistence.open({
        dialect: "mysql",
        url: "mysql://db/x",
        file: null,
        migrate: "on-start",
      }),
    ).rejects.toBeInstanceOf(PersistenceUnsupportedDialectError);
    expect(Persistence.status()).toBeNull();

    await Persistence.open(memory);
    await Persistence.close();
    expect(Persistence.status()).toBeNull();
  });
});
