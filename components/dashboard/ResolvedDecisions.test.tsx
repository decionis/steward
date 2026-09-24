import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { ResolvedDecisions } from "./ResolvedDecisions";

describe("ResolvedDecisions", () => {
  it("renders nothing when no decision has reached an outcome", () => {
    const { container } = render(<ResolvedDecisions opportunities={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists completed decisions read-only, with their dossier and account link", () => {
    const completed = DemoStewardData.opportunities().filter(
      (opportunity) => opportunity.status === "COMPLETED",
    );
    const [first] = completed;
    if (!first) throw new Error("fixture missing");

    render(<ResolvedDecisions opportunities={completed} />);

    const section = screen.getByRole("region", { name: "Recently resolved" });
    expect(within(section).getByText(first.title)).toBeInTheDocument();
    expect(
      within(section).getByText(first.dossierId ?? ""),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: /Kilo Payments/ }),
    ).toHaveAttribute("href", "/accounts/acct-kilo");
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    expect(section).toHaveTextContent(
      `${completed.length} ${completed.length === 1 ? "decision" : "decisions"} that reached an outcome`,
    );
  });
});
