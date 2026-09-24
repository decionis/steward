/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { CapturedSignalSchema } from "@/domain/signals/CapturedSignal";
import { SignalSourceSchema } from "@/domain/signals/SignalSource";
import { DemoSignalConnector } from "./DemoSignalConnector";

const connectors = DemoSignalConnector.all();

describe("DemoSignalConnector — provenance and contract", () => {
  it("satisfies the published contracts", async () => {
    for (const connector of connectors) {
      expect(() => SignalSourceSchema.parse(connector.source)).not.toThrow();
      for (const signal of await connector.collect()) {
        expect(() => CapturedSignalSchema.parse(signal)).not.toThrow();
        expect(signal.sourceId).toBe(connector.source.id);
      }
    }
  });

  it("references accounts the way the demo CRM does, and names no host, URL or address", async () => {
    const serialized = JSON.stringify(
      await Promise.all(
        connectors.map(async (c) => [c.source, await c.collect()]),
      ),
    );
    for (const connector of connectors) {
      for (const signal of await connector.collect()) {
        expect(signal.accountReference).toMatch(/^CRM-DEMO-\d{4}$/);
      }
    }
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/\+\d[\d\s().-]{7,}/);
  });

  it("dates nothing in the future", async () => {
    for (const connector of connectors) {
      for (const signal of await connector.collect()) {
        expect(new Date(signal.observedAt).getTime()).toBeLessThanOrEqual(
          Date.now(),
        );
      }
    }
  });

  it("includes a source that is not yet configured, so the page shows that state", () => {
    expect(connectors.some((c) => !c.source.enabled)).toBe(true);
  });
});
