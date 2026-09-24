import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoSignalConnector } from "@/infra/connectors/DemoSignalConnector";
import { SourceTable } from "./SourceTable";

const sources = DemoSignalConnector.all().map((c) => c.source);

describe("SourceTable", () => {
  it("lists every source with its health and offers to collect from the enabled ones", () => {
    render(<SourceTable sources={sources} canCollect />);

    const table = screen.getByRole("table", { name: "Signal sources" });
    expect(within(table).getByText("Support desk")).toBeInTheDocument();
    expect(within(table).getByText("crm.demo (fixture)")).toBeInTheDocument();
    expect(within(table).getByText("Document upload")).toBeInTheDocument();
    expect(
      within(table).getAllByRole("button", { name: "Collect now" }).length,
    ).toBe(sources.filter((s) => s.enabled).length);
    expect(
      within(table).getByRole("button", { name: "Not configured" }),
    ).toBeDisabled();
  });

  it("shows the sources to a viewer but offers no collection", () => {
    render(<SourceTable sources={sources} canCollect={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByText("Operator role required").length).toBe(
      sources.length,
    );
  });

  it("says plainly when nothing is configured", () => {
    render(<SourceTable sources={[]} canCollect />);
    expect(
      screen.getByText(/No signal sources are configured/),
    ).toBeInTheDocument();
  });
});
