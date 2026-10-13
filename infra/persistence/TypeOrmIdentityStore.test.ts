/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersistenceConfig } from "@/infra/config/StewardRuntimeConfig";
import { Persistence } from "./Persistence";
import { TypeOrmIdentityStore } from "./TypeOrmIdentityStore";

const memory: PersistenceConfig = {
  dialect: "sqlite",
  url: null,
  file: ":memory:",
  migrate: "on-start",
};

let now = new Date("2026-10-13T10:00:00.000Z");
let store: TypeOrmIdentityStore;

beforeEach(async () => {
  now = new Date("2026-10-13T10:00:00.000Z");
  store = new TypeOrmIdentityStore(await Persistence.open(memory), () => now);
});

afterEach(() => Persistence.close());

const erin = {
  ssoSubject: "https://issuer.example/realms/steward#erin",
  email: "erin@example.test",
  displayName: "Erin Example",
  roles: ["APPROVER" as const],
};

describe("TypeOrmIdentityStore — users", () => {
  it("creates the user on first sign-in and updates them on the next", async () => {
    const first = await store.upsertSsoUser(erin);
    const second = await store.upsertSsoUser({
      ...erin,
      displayName: "Erin E.",
      roles: ["ADMIN", "AUDITS"],
    });

    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe("Erin E.");
    expect(second.roles).toEqual(["ADMIN", "AUDITS"]);
  });

  it("finds a user by the issuer subject they sign in as, and nobody by an unknown one", async () => {
    const created = await store.upsertSsoUser(erin);
    expect((await store.findUserBySsoSubject(erin.ssoSubject))?.id).toBe(
      created.id,
    );
    expect(
      await store.findUserBySsoSubject(
        "https://issuer.example/realms/steward#nobody",
      ),
    ).toBeNull();
  });

  it("links an existing account by email when the subject is new, so a migration keeps the user", async () => {
    const first = await store.upsertSsoUser(erin);
    const linked = await store.upsertSsoUser({
      ...erin,
      ssoSubject: "https://other.example#erin",
    });
    expect(linked.id).toBe(first.id);
  });
});

describe("TypeOrmIdentityStore — sessions", () => {
  it("opens a session the browser can hold as an opaque id, and finds it while it lives", async () => {
    const user = await store.upsertSsoUser(erin);
    const session = await store.createSession({
      userId: user.id,
      expiresAt: new Date(now.getTime() + 3_600_000),
      ssoSessionId: "sid-1",
      ssoIdToken: "id.tok.en",
    });

    expect(session.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const found = await store.findActiveSession(session.id);
    expect(found?.user.displayName).toBe("Erin Example");
    expect(found?.ssoSessionId).toBe("sid-1");
    expect(found?.ssoIdToken).toBe("id.tok.en");
  });

  it("finds nothing for an unknown id, an expired session, or a revoked one", async () => {
    const user = await store.upsertSsoUser(erin);
    const session = await store.createSession({
      userId: user.id,
      expiresAt: new Date(now.getTime() + 1_000),
      ssoSessionId: null,
      ssoIdToken: null,
    });

    expect(await store.findActiveSession("unknown")).toBeNull();

    now = new Date(now.getTime() + 2_000);
    expect(await store.findActiveSession(session.id)).toBeNull();

    now = new Date(now.getTime() - 2_000);
    expect(await store.revokeSession(session.id)).toBe(true);
    expect(await store.revokeSession(session.id)).toBe(false);
    expect(await store.findActiveSession(session.id)).toBeNull();
  });

  it("revokes by the issuer's session and by the subject, counting only what was live", async () => {
    const user = await store.upsertSsoUser(erin);
    const open = (sid: string | null) =>
      store.createSession({
        userId: user.id,
        expiresAt: new Date(now.getTime() + 3_600_000),
        ssoSessionId: sid,
        ssoIdToken: null,
      });
    const a = await open("sid-1");
    const b = await open("sid-1");
    const c = await open("sid-2");
    await store.revokeSession(b.id);

    expect(await store.revokeSessionsByIssuerSession("sid-1")).toBe(1);
    expect(await store.findActiveSession(a.id)).toBeNull();
    expect(await store.findActiveSession(c.id)).not.toBeNull();

    expect(await store.revokeSessionsBySsoSubject(erin.ssoSubject)).toBe(1);
    expect(await store.findActiveSession(c.id)).toBeNull();
    expect(await store.revokeSessionsBySsoSubject("nobody")).toBe(0);
  });

  it("records activities with the actor and the moment", async () => {
    const user = await store.upsertSsoUser(erin);
    await store.recordActivity({
      userId: user.id,
      kind: "SIGNED_IN",
      detail: "kloakware",
    });
    const dataSource = await Persistence.open(memory);
    const rows = (await dataSource.query(
      "SELECT user_id, kind, occurred_at, detail FROM activities",
    )) as {
      user_id: string;
      kind: string;
      occurred_at: string;
      detail: string;
    }[];
    expect(rows).toEqual([
      {
        user_id: user.id,
        kind: "SIGNED_IN",
        occurred_at: now.toISOString(),
        detail: "kloakware",
      },
    ]);
  });
});
