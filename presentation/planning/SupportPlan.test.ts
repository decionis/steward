/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import type { AccountSummary } from "@/domain/accounts/CustomerAccount";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { SupportPlan } from "./SupportPlan";

function account(
  overrides: Partial<AccountSummary> & Pick<AccountSummary, "id" | "name">,
): AccountSummary {
  return {
    externalReference: "CRM-DEMO-0009",
    segment: "Enterprise",
    primaryRegion: "United Kingdom",
    corridors: ["UK → NG"],
    state: "HEALTHY",
    owner: "Erin Example",
    healthScore: 80,
    evidenceCoverage: 80,
    limitUtilization: 50,
    currentLimit: { amount: 100000, currency: "GBP" },
    proposedLimit: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("SupportPlan — against the demo fixtures", () => {
  const accounts = DemoStewardData.portfolio().accounts;

  it("puts the region with active friction first, then the one with a review required", () => {
    const { groups } = new SupportPlan(accounts).by("region");

    expect(groups.map((g) => g.key)).toEqual([
      "United States",
      "Singapore",
      "Norway",
      "United Kingdom",
    ]);
    expect(groups[0]).toMatchObject({ friction: 1, accounts: 1 });
    expect(groups[1]).toMatchObject({ reviewsRequired: 1 });
  });

  it("groups by segment with the counts the summary cards show", () => {
    const { groups } = new SupportPlan(accounts).by("segment");

    const enterprise = groups.find((g) => g.key === "Enterprise");
    const midMarket = groups.find((g) => g.key === "Mid-market");
    expect(enterprise).toMatchObject({
      accounts: 2,
      friction: 1,
      expansionReady: 1,
      names: ["Kilo Payments", "Sierra Treasury"],
    });
    expect(midMarket).toMatchObject({
      accounts: 2,
      reviewsRequired: 1,
      healthy: 1,
      names: ["Tango Trade Services", "Victor Remit"],
    });
    expect(groups[0]?.key).toBe("Enterprise");
  });
});

describe("SupportPlan — arithmetic and ordering", () => {
  it("averages health and utilisation and rounds them", () => {
    const { groups } = new SupportPlan([
      account({
        id: "a",
        name: "Alfa Pay",
        healthScore: 91,
        limitUtilization: 33,
      }),
      account({
        id: "b",
        name: "Bravo Pay",
        healthScore: 62,
        limitUtilization: 34,
      }),
    ]).by("region");

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      averageHealthScore: 77,
      averageUtilization: 34,
      names: ["Alfa Pay", "Bravo Pay"],
    });
  });

  it("breaks ties by size, then by name", () => {
    const { groups } = new SupportPlan([
      account({ id: "a", name: "Alfa Pay", primaryRegion: "Zulu Land" }),
      account({ id: "b", name: "Bravo Pay", primaryRegion: "Echo Land" }),
      account({ id: "c", name: "Charlie Pay", primaryRegion: "Echo Land" }),
    ]).by("region");

    expect(groups.map((g) => g.key)).toEqual(["Echo Land", "Zulu Land"]);
  });

  it("handles an empty portfolio", () => {
    expect(new SupportPlan([]).by("segment").groups).toEqual([]);
  });
});
