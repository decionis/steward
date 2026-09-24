import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { AccountTimeline } from "./AccountTimeline";

describe("AccountTimeline", () => {
  it("marks the stage of each event so an outcome is distinguishable from a signal", () => {
    const account = DemoStewardData.account("acct-kilo");
    if (!account) throw new Error("fixture missing");

    render(<AccountTimeline events={account.timeline} />);

    const outcome = screen
      .getByText("Previous limit increase applied")
      .closest("li");
    expect(outcome).toHaveAttribute("data-kind", "OUTCOME");

    const signal = screen
      .getByText("Utilisation crossed the review threshold")
      .closest("li");
    expect(signal).toHaveAttribute("data-kind", "SIGNAL");
  });
});
