import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { ArbitrationNote } from "./ArbitrationNote";

function tango() {
  const opportunity = DemoStewardData.opportunities().find(
    (candidate) => candidate.accountId === "acct-tango",
  );
  const account = DemoStewardData.account("acct-tango");
  if (!opportunity?.arbitration || !account) throw new Error("fixture missing");
  return { arbitration: opportunity.arbitration, evidence: account.evidence };
}

describe("ArbitrationNote", () => {
  it("renders nothing when the platform sent no arbitration", () => {
    const { container } = render(<ArbitrationNote arbitration={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names signals by title when given the account's evidence", () => {
    const { arbitration, evidence } = tango();

    render(<ArbitrationNote arbitration={arbitration} evidence={evidence} />);

    const note = screen.getByRole("note", { name: "Why this disposition" });
    expect(note).toHaveTextContent("POLICY");
    expect(note).toHaveTextContent("customer_ops.v4");
    expect(note).toHaveTextContent("Beneficial ownership evidence is stale");
    expect(note).toHaveTextContent("Overrides");
    expect(note).toHaveTextContent("Utilisation sustained above 85%");
    expect(note).toHaveTextContent("Suppressed");
    expect(note).toHaveTextContent("Processing-limit review");
    expect(note).not.toHaveTextContent("ev-tango");
  });

  it("counts signals when evidence is not on the page", () => {
    const { arbitration } = tango();

    render(<ArbitrationNote arbitration={arbitration} />);

    const note = screen.getByRole("note", { name: "Why this disposition" });
    expect(note).toHaveTextContent("Rests on1 linked signal");
    expect(note).toHaveTextContent("Overrides1 linked signal");
  });

  it("omits the override and suppression rows when there is nothing in them", () => {
    const { arbitration, evidence } = tango();

    render(
      <ArbitrationNote
        arbitration={{
          ...arbitration,
          overriddenEvidenceIds: [],
          suppressedActions: [],
        }}
        evidence={evidence}
      />,
    );

    const note = screen.getByRole("note", { name: "Why this disposition" });
    expect(note).not.toHaveTextContent("Overrides");
    expect(note).not.toHaveTextContent("Suppressed");
  });
});
