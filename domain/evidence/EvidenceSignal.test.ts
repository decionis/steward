/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { EvidenceSignalSchema } from "./EvidenceSignal";

const signal = {
  id: "ev-1",
  title: "Utilisation sustained above 85%",
  detail: "Three consecutive weeks above the review threshold.",
  source: "Product usage",
  sourceRecordId: "usage-0001",
  observedAt: "2026-09-24T12:00:00.000Z",
  freshness: "LIVE",
  confidence: 0.96,
  impact: "POSITIVE",
  category: "USAGE",
};

describe("EvidenceSignalSchema — contextClass", () => {
  it("parses a signal without a class, so an upstream that has not shipped it still works", () => {
    const parsed = EvidenceSignalSchema.parse(signal);
    expect(parsed.contextClass).toBeUndefined();
  });

  it.each(["JOURNEY", "INTENT", "FRICTION", "OPERATIONAL", "POLICY"])(
    "accepts %s",
    (contextClass) => {
      expect(
        EvidenceSignalSchema.parse({ ...signal, contextClass }).contextClass,
      ).toBe(contextClass);
    },
  );

  it("rejects ENVIRONMENTAL, which has no producer and is deliberately absent", () => {
    expect(() =>
      EvidenceSignalSchema.parse({ ...signal, contextClass: "ENVIRONMENTAL" }),
    ).toThrow();
  });

  it("rejects a class in the wrong case rather than normalising it", () => {
    expect(() =>
      EvidenceSignalSchema.parse({ ...signal, contextClass: "friction" }),
    ).toThrow();
  });
});
