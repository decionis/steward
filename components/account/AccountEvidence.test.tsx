import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { AccountEvidence } from "./AccountEvidence";

function unclassified(): EvidenceSignal {
  return {
    id: "ev-live",
    title: "A signal from an upstream that has not shipped classes",
    detail: "Rendered exactly as before.",
    source: "CRM",
    sourceRecordId: "crm-0001",
    observedAt: new Date().toISOString(),
    freshness: "CURRENT",
    confidence: 0.8,
    impact: "NEUTRAL",
    category: "CRM",
  };
}

describe("AccountEvidence — context class", () => {
  it("shows the class beside the source category when the platform supplies it", () => {
    const account = DemoStewardData.account("acct-tango");
    if (!account) throw new Error("fixture missing");

    render(<AccountEvidence evidence={account.evidence} />);

    expect(screen.getByText("POLICY")).toBeInTheDocument();
    expect(screen.getByText("KYC_KYB")).toBeInTheDocument();
  });

  it("shows only the category when no class is present, and never infers one", () => {
    render(<AccountEvidence evidence={[unclassified()]} />);

    expect(screen.getByText("CRM")).toBeInTheDocument();
    for (const contextClass of [
      "JOURNEY",
      "INTENT",
      "FRICTION",
      "OPERATIONAL",
      "POLICY",
    ]) {
      expect(screen.queryByText(contextClass)).not.toBeInTheDocument();
    }
  });
});
