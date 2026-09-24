import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  CustomerOpportunity,
  OpportunityKind,
} from "@/domain/opportunities/CustomerOpportunity";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { AccountDecisionPanel } from "./AccountDecisionPanel";

function fixtureOfKind(kind: OpportunityKind): CustomerOpportunity {
  const match = DemoStewardData.opportunities().find(
    (opportunity) => opportunity.kind === kind,
  );
  if (!match) throw new Error(`No demo opportunity of kind ${kind}`);
  return match;
}

describe("AccountDecisionPanel", () => {
  it("says no recommendation was returned without claiming a no-action decision", () => {
    render(<AccountDecisionPanel opportunity={null} canReview />);

    expect(screen.getByText("No open recommendation")).toBeInTheDocument();
    expect(screen.queryByText("Deliberate inaction")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a NO_ACTION opportunity as a recorded decision with evidence and a dossier", () => {
    const noAction = fixtureOfKind("NO_ACTION");

    render(<AccountDecisionPanel opportunity={noAction} canReview />);

    expect(screen.getByText("Deliberate inaction")).toBeInTheDocument();
    expect(screen.getByText(noAction.title)).toBeInTheDocument();
    expect(screen.getByText(noAction.dossierId ?? "")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept recommendation" }),
    ).toBeInTheDocument();
  });

  it("does not label an ordinary recommendation as inaction", () => {
    const review = fixtureOfKind("PROCESSING_LIMIT_REVIEW");

    render(<AccountDecisionPanel opportunity={review} canReview={false} />);

    expect(screen.queryByText("Deliberate inaction")).not.toBeInTheDocument();
    expect(screen.getByText("Approver role required")).toBeInTheDocument();
  });
});
