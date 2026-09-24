/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from "vitest";
import type { StewardSession } from "@/domain/auth/StewardSession";
import { DemoSignalConnector } from "@/infra/connectors/DemoSignalConnector";
import { SignalConnectorRegistry } from "@/infra/connectors/SignalConnectorRegistry";
import {
  StewardForbiddenError,
  StewardNotFoundError,
  StewardUnavailableError,
} from "@/infra/errors/StewardErrors";
import { DecionisSignalRepository } from "@/infra/repositories/DecionisSignalRepository";
import { DemoSignalRepository } from "@/infra/repositories/DemoSignalRepository";
import { SignalService } from "./SignalService";

function session(roles: StewardSession["roles"]): StewardSession {
  return {
    subject: "op-1",
    displayName: "Erin Example",
    orgId: "demo-fintech",
    roles,
    accessToken: null,
    mode: "DEMO",
  };
}
const registry = new SignalConnectorRegistry(DemoSignalConnector.all());

describe("SignalService", () => {
  it("lists sources for any role, including VIEWER", () => {
    const service = new SignalService(
      registry,
      new DemoSignalRepository(),
      session(["VIEWER"]),
    );
    expect(service.listSources().length).toBeGreaterThan(0);
  });

  it("refuses to collect for VIEWER: collection reaches a system the operator connected", async () => {
    const service = new SignalService(
      registry,
      new DemoSignalRepository(),
      session(["VIEWER"]),
    );
    await expect(service.collect("src-demo-crm")).rejects.toBeInstanceOf(
      StewardForbiddenError,
    );
  });

  it("collects and forwards for OPERATOR, and the batch carries what the connector produced", async () => {
    const repository = new DemoSignalRepository();
    const forward = vi.spyOn(repository, "forward");
    const service = new SignalService(
      registry,
      repository,
      session(["OPERATOR"]),
    );

    const { batch, result } = await service.collect("src-demo-crm");

    expect(batch.sourceId).toBe("src-demo-crm");
    expect(batch.signals.length).toBeGreaterThan(0);
    expect(batch.signals.every((s) => s.sourceId === "src-demo-crm")).toBe(
      true,
    );
    expect(result.accepted).toBe(batch.signals.length);
    expect(result.rejected).toEqual([]);
    expect(forward).toHaveBeenCalledWith(batch);
  });

  it("refuses a source that is not configured, with a 503-class error, not an empty success", async () => {
    const service = new SignalService(
      registry,
      new DemoSignalRepository(),
      session(["ADMIN"]),
    );
    await expect(service.collect("src-demo-upload")).rejects.toBeInstanceOf(
      StewardUnavailableError,
    );
  });

  it("reports an unknown source as not found", async () => {
    const service = new SignalService(
      registry,
      new DemoSignalRepository(),
      session(["ADMIN"]),
    );
    await expect(service.collect("src-nope")).rejects.toBeInstanceOf(
      StewardNotFoundError,
    );
  });

  it("in live mode without the ingress configured says so, and stores nothing", async () => {
    const service = new SignalService(
      registry,
      new DecionisSignalRepository(null),
      session(["APPROVER"]),
    );
    await expect(service.collect("src-demo-crm")).rejects.toThrow(
      /not configured on this deployment/,
    );
  });
});
