import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewAction } from "./ReviewAction";

function stubReview(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ReviewAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the decision and reports the recorded status", async () => {
    const fetchMock = stubReview({
      opportunity: { status: "APPROVED", disposition: "REVIEW" },
    });

    render(
      <ReviewAction
        opportunityId="opp-1"
        canReview
        displayedDisposition="REVIEW"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Accept recommendation" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Recorded as approved.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("changed");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/steward/opportunities/opp-1/review",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("says so when the platform's disposition differs from the one on screen", async () => {
    stubReview({ opportunity: { status: "HELD", disposition: "BLOCK" } });

    render(
      <ReviewAction
        opportunityId="opp-1"
        canReview
        displayedDisposition="REVIEW"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hold" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The platform's disposition changed since this page loaded: it is now BLOCK.",
    );
  });

  it("stays quiet about disposition when none was displayed", async () => {
    stubReview({ opportunity: { status: "REJECTED", disposition: "BLOCK" } });

    render(<ReviewAction opportunityId="opp-1" canReview />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Recorded as rejected.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("changed");
  });

  it("surfaces the upstream message on failure", async () => {
    stubReview({ message: "Opportunity not found" }, false);

    render(<ReviewAction opportunityId="opp-1" canReview />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Opportunity not found",
    );
  });
});
