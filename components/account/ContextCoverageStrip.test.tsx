import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { ContextCoverageStrip } from "./ContextCoverageStrip";

function unclassified(id: string): EvidenceSignal {
  return {
    id,
    title: id,
    detail: id,
    source: "CRM",
    sourceRecordId: `${id}-record`,
    observedAt: new Date().toISOString(),
    freshness: "LIVE",
    confidence: 0.8,
    impact: "NEUTRAL",
    category: "CRM",
  };
}

describe("ContextCoverageStrip", () => {
  it("renders nothing when a linked signal has no class", () => {
    const { container } = render(
      <ContextCoverageStrip
        linkedEvidenceIds={["a"]}
        evidence={[unclassified("a")]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows each class with its coverage for a classified recommendation", () => {
    const account = DemoStewardData.account("acct-kilo");
    const opportunity = DemoStewardData.opportunities().find(
      (candidate) => candidate.accountId === "acct-kilo",
    );
    if (!account || !opportunity) throw new Error("fixture missing");

    render(
      <ContextCoverageStrip
        linkedEvidenceIds={opportunity.evidenceIds}
        evidence={account.evidence}
      />,
    );

    const strip = screen.getByRole("group", { name: "Context coverage" });
    expect(strip).toHaveTextContent("3 of 5 classes current");
    const items = within(strip).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-coverage"))).toEqual([
      "CURRENT",
      "CURRENT",
      "ABSENT",
      "ABSENT",
      "CURRENT",
    ]);
    expect(
      within(strip).getByText("OPERATIONAL").closest("li"),
    ).toHaveAttribute("title", "no linked signal");
  });
});
