/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
  ArbitrationSchema,
  CustomerOpportunitySchema,
} from "./CustomerOpportunity";

const opportunity = {
  id: "opp-1",
  accountId: "acct-1",
  accountName: "Kilo Payments",
  kind: "HOLD_FOR_MORE_EVIDENCE",
  status: "OPEN",
  title: "Hold expansion pending KYB refresh",
  rationale: "Beneficial-ownership evidence is stale under the active policy.",
  recommendedAction: "Request a KYB refresh.",
  disposition: "BLOCK",
  confidence: 0.89,
  evidenceCoverage: 69,
  evidenceIds: ["ev-usage", "ev-kyb"],
  priority: "ROUTINE",
  createdAt: "2026-09-24T12:00:00.000Z",
  dossierId: "dos_1",
};

const arbitration = {
  governingClass: "POLICY",
  governingEvidenceIds: ["ev-kyb"],
  overriddenEvidenceIds: ["ev-usage"],
  suppressedActions: ["Processing-limit review"],
  policyReference: "customer_ops.v4",
  summary: "KYB is outside the freshness window; utilisation is overridden.",
};

describe("CustomerOpportunitySchema — arbitration", () => {
  it("parses an opportunity without arbitration, so an upstream that has not shipped it still works", () => {
    expect(
      CustomerOpportunitySchema.parse(opportunity).arbitration,
    ).toBeUndefined();
  });

  it("parses an opportunity with arbitration", () => {
    const parsed = CustomerOpportunitySchema.parse({
      ...opportunity,
      arbitration,
    });
    expect(parsed.arbitration?.governingClass).toBe("POLICY");
    expect(parsed.arbitration?.suppressedActions).toEqual([
      "Processing-limit review",
    ]);
  });

  it("requires at least one governing signal: an arbitration that rests on nothing is not one", () => {
    expect(() =>
      ArbitrationSchema.parse({ ...arbitration, governingEvidenceIds: [] }),
    ).toThrow();
  });

  it("allows empty overrides and suppressions", () => {
    expect(() =>
      ArbitrationSchema.parse({
        ...arbitration,
        overriddenEvidenceIds: [],
        suppressedActions: [],
      }),
    ).not.toThrow();
  });

  it("rejects a governing class outside the contract", () => {
    expect(() =>
      ArbitrationSchema.parse({
        ...arbitration,
        governingClass: "ENVIRONMENTAL",
      }),
    ).toThrow();
  });
});
