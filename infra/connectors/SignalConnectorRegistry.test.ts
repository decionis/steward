/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { StewardNotFoundError } from "@/infra/errors/StewardErrors";
import { DemoSignalConnector } from "./DemoSignalConnector";
import { SignalConnectorRegistry } from "./SignalConnectorRegistry";

describe("SignalConnectorRegistry", () => {
  const registry = new SignalConnectorRegistry(DemoSignalConnector.all());

  it("lists every configured source", () => {
    expect(registry.list().map((s) => s.id)).toContain("src-demo-crm");
    expect(registry.list().length).toBeGreaterThan(1);
  });

  it("finds a connector by id and refuses an unknown one", () => {
    expect(registry.require("src-demo-crm").source.kind).toBe("CRM");
    expect(() => registry.require("src-nope")).toThrow(StewardNotFoundError);
  });
});
