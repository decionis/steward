import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { SupportPlan } from "./SupportPlan";

describe("SupportPlan", () => {
  it("shows the portfolio by region and by segment, friction first", () => {
    render(<SupportPlan accounts={DemoStewardData.portfolio().accounts} />);

    const byRegion = screen.getByRole("table", { name: "By region" });
    const rows = within(byRegion).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("United States")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Sierra Treasury")).toBeInTheDocument();

    const bySegment = screen.getByRole("table", { name: "By segment" });
    const segmentRows = within(bySegment).getAllByRole("row").slice(1);
    expect(within(segmentRows[0]!).getByText("Enterprise")).toBeInTheDocument();
    expect(
      within(segmentRows[0]!).getByText("Kilo Payments · Sierra Treasury"),
    ).toBeInTheDocument();
  });
});
