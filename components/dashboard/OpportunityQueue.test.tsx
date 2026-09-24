import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { OpportunityQueue } from "./OpportunityQueue";

const QUEUE = "What needs a decision now";
const INACTION = "Decided: no action, or held";

describe("OpportunityQueue", () => {
  it("keeps NO_ACTION out of the queue and shows it under deliberate inaction", () => {
    const opportunities = DemoStewardData.opportunities();
    const noAction = opportunities.find((o) => o.kind === "NO_ACTION");
    const limitReview = opportunities.find(
      (o) => o.kind === "PROCESSING_LIMIT_REVIEW",
    );
    if (!noAction || !limitReview) throw new Error("fixtures missing");

    render(<OpportunityQueue opportunities={opportunities} canReview />);

    const queue = screen.getByRole("region", { name: QUEUE });
    const inaction = screen.getByRole("region", { name: INACTION });

    expect(within(queue).getByText(limitReview.title)).toBeInTheDocument();
    expect(within(queue).queryByText(noAction.title)).not.toBeInTheDocument();
    expect(within(inaction).getByText(noAction.title)).toBeInTheDocument();
    expect(
      within(queue).getByText(
        `${opportunities.length - 1} evidence-backed recommendations`,
      ),
    ).toBeInTheDocument();
  });

  it("treats a HELD review as deliberate inaction", () => {
    const pending = DemoStewardData.opportunities().filter(
      (o) => o.kind !== "NO_ACTION",
    );
    const first = pending[0];
    if (!first) throw new Error("fixtures missing");
    const held = { ...first, status: "HELD" as const };

    render(
      <OpportunityQueue
        opportunities={[held, ...pending.slice(1)]}
        canReview
      />,
    );

    const inaction = screen.getByRole("region", { name: INACTION });
    expect(within(inaction).getByText(held.title)).toBeInTheDocument();
  });

  it("omits the inaction group when there is nothing in it", () => {
    const pending = DemoStewardData.opportunities().filter(
      (o) => o.kind !== "NO_ACTION" && o.status !== "HELD",
    );

    render(<OpportunityQueue opportunities={pending} canReview={false} />);

    expect(
      screen.queryByRole("region", { name: INACTION }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Approver role required")).toHaveLength(
      pending.length,
    );
  });

  it("says so when nothing is waiting for a decision", () => {
    const onlyInaction = DemoStewardData.opportunities().filter(
      (o) => o.kind === "NO_ACTION",
    );

    render(<OpportunityQueue opportunities={onlyInaction} canReview />);

    expect(
      screen.getByText("Nothing is waiting for a decision."),
    ).toBeInTheDocument();
  });
});
