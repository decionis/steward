/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { CapturedSignalSchema, SignalBatchSchema } from "./CapturedSignal";

const signal = {
  id: "crm-demo-0001-milestone",
  sourceId: "src-demo-crm",
  sourceRecordId: "crm-kilo-20260924",
  accountReference: "CRM-DEMO-0001",
  observedAt: "2026-09-24T10:00:00.000Z",
  capturedAt: "2026-09-24T10:05:00.000Z",
  category: "CRM",
  title: "Expansion milestone recorded",
  detail: "Contracted volume commitment signed.",
  confidence: 0.9,
};

describe("CapturedSignal — the minimum viable payload", () => {
  it("parses a signal without a context class; the platform may assign one", () => {
    expect(CapturedSignalSchema.parse(signal).contextClass).toBeUndefined();
  });

  it("accepts DOCUMENT, the category for signals extracted from a file", () => {
    expect(
      CapturedSignalSchema.parse({ ...signal, category: "DOCUMENT" }).category,
    ).toBe("DOCUMENT");
  });

  it("refuses a signal with no account reference: the platform cannot resolve nothing", () => {
    expect(() =>
      CapturedSignalSchema.parse({ ...signal, accountReference: "" }),
    ).toThrow();
  });

  it("refuses a confidence outside 0 to 1", () => {
    expect(() =>
      CapturedSignalSchema.parse({ ...signal, confidence: 1.2 }),
    ).toThrow();
  });

  it("parses an empty batch, which a healthy source with nothing new legitimately returns", () => {
    expect(
      SignalBatchSchema.parse({
        batchId: "b1",
        sourceId: "src-demo-crm",
        collectedAt: "2026-09-24T10:05:00.000Z",
        signals: [],
      }).signals,
    ).toEqual([]);
  });
});
