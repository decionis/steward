/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Persistence } from "./Persistence";
import { startPersistence } from "./Startup";

const live = {
  NODE_ENV: "production",
  STEWARD_DATA_MODE: "live",
  DECIONIS_API_BASE_URL: "https://api.decionis.com",
} as const;

describe("startPersistence — what the server does before its first request", () => {
  afterEach(async () => {
    await Persistence.close();
    vi.restoreAllMocks();
  });

  it("opens nothing in demo mode", async () => {
    const exit = vi.fn();
    const outcome = await startPersistence({ NODE_ENV: "development" }, exit);

    expect(outcome.opened).toBe(false);
    expect(exit).not.toHaveBeenCalled();
    expect(Persistence.status()).toBeNull();
  });

  it("opens the embedded database and migrates it at start", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const exit = vi.fn();

    const outcome = await startPersistence(
      { ...live, STEWARD_DATABASE_URL: "sqlite::memory:" },
      exit,
    );

    expect(outcome.opened).toBe(true);
    expect(outcome.message).toMatch(/1 migration\(s\) applied at start/);
    expect(exit).not.toHaveBeenCalled();
    expect(Persistence.status()?.migrated).toBe(true);
  });

  it("refuses to serve, with the reason, when the configuration is wrong", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.fn();

    const outcome = await startPersistence(
      { NODE_ENV: "production", STEWARD_DATA_MODE: "live" },
      exit,
    );

    expect(exit).toHaveBeenCalledWith(1);
    expect(outcome.message).toMatch(/DECIONIS_API_BASE_URL/);
  });

  it("refuses to serve when the database cannot be opened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.fn();

    const outcome = await startPersistence(
      { ...live, STEWARD_DATABASE_URL: "postgres://steward@db/steward" },
      exit,
    );

    expect(exit).toHaveBeenCalledWith(1);
    expect(outcome.message).toMatch(/issues\/95/);
    expect(Persistence.status()).toBeNull();
  });
});
