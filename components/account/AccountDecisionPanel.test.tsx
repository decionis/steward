import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CustomerAccount } from "@/domain/accounts/CustomerAccount";
import type {
  CustomerOpportunity,
  OpportunityKind,
} from "@/domain/opportunities/CustomerOpportunity";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { AccountDecisionPanel } from "./AccountDecisionPanel";

function fixtureOfKind(kind: OpportunityKind): {
  opportunity: CustomerOpportunity;
  account: CustomerAccount;
} {
  const opportunity = DemoStewardData.opportunities().find(
    (candidate) => candidate.kind === kind,
  );
  const account = opportunity
    ? DemoStewardData.account(opportunity.accountId)
    : null;
  if (!opportunity || !account) {
    throw new Error(`No demo opportunity of kind ${kind}`);
  }
  return { opportunity, account };
}

function renderPanel(
  opportunity: CustomerOpportunity | null,
  account: CustomerAccount | null,
  canReview = true,
) {
  return render(
    <AccountDecisionPanel
      opportunity={opportunity}
      canReview={canReview}
      evidence={account?.evidence ?? []}
      connectors={account?.connectors ?? []}
      updatedAt={account?.updatedAt ?? new Date().toISOString()}
    />,
  );
}

describe("AccountDecisionPanel — inaction", () => {
  it("says no recommendation was returned without claiming a no-action decision", () => {
    renderPanel(null, null);

    expect(screen.getByText("No open recommendation")).toBeInTheDocument();
    expect(screen.queryByText("Deliberate inaction")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("renders a NO_ACTION opportunity as a recorded decision with evidence and a dossier", () => {
    const { opportunity, account } = fixtureOfKind("NO_ACTION");

    renderPanel(opportunity, account);

    expect(screen.getByText("Deliberate inaction")).toBeInTheDocument();
    expect(screen.getByText(opportunity.title)).toBeInTheDocument();
    expect(screen.getByText(opportunity.dossierId ?? "")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept recommendation" }),
    ).toBeInTheDocument();
  });

  it("does not label an ordinary recommendation as inaction", () => {
    const { opportunity, account } = fixtureOfKind("PROCESSING_LIMIT_REVIEW");

    renderPanel(opportunity, account, false);

    expect(screen.queryByText("Deliberate inaction")).not.toBeInTheDocument();
    expect(screen.getByText("Approver role required")).toBeInTheDocument();
  });
});

describe("AccountDecisionPanel — context at review", () => {
  it("reads as steady when linked evidence is fresh and its sources are healthy", () => {
    const { opportunity, account } = fixtureOfKind("PROCESSING_LIMIT_REVIEW");

    renderPanel(opportunity, account);

    const note = screen.getByRole("note", { name: "Context at review" });
    expect(note).toHaveAttribute("data-tone", "steady");
    expect(note).toHaveTextContent(
      "All 3 linked signals are live or current; all sources healthy.",
    );
    expect(note).toHaveTextContent("Account evidence updated");
  });

  it("flags stale linked evidence and its stale source", () => {
    const { opportunity, account } = fixtureOfKind("HOLD_FOR_MORE_EVIDENCE");

    renderPanel(opportunity, account);

    const note = screen.getByRole("note", { name: "Context at review" });
    expect(note).toHaveAttribute("data-tone", "attention");
    expect(note).toHaveTextContent(
      "1 of 2 linked signals is stale; KYC / KYB is stale.",
    );
  });

  it("flags a degraded source even when the linked evidence is fresh", () => {
    const { opportunity, account } = fixtureOfKind("FRICTION_INTERVENTION");

    renderPanel(opportunity, account);

    const note = screen.getByRole("note", { name: "Context at review" });
    expect(note).toHaveAttribute("data-tone", "attention");
    expect(note).toHaveTextContent("Settlement ledger is degraded.");
  });
});
