import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectAction } from "./CollectAction";

function stub(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CollectAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to the source's collect route and reports the batch and the upstream result", async () => {
    const fetchMock = stub({
      batch: { signals: [1, 2] },
      result: { accepted: 2, rejected: [] },
    });
    render(<CollectAction sourceId="src-demo-crm" enabled canCollect />);
    fireEvent.click(screen.getByRole("button", { name: "Collect now" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Collected 2 signals; 2 accepted upstream.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/steward/signals/sources/src-demo-crm/collect",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the upstream's own message when forwarding is unavailable", async () => {
    stub(
      {
        message:
          "The Decionis Protocol does not yet publish a signal ingestion operation",
      },
      false,
    );
    render(<CollectAction sourceId="src-demo-crm" enabled canCollect />);
    fireEvent.click(screen.getByRole("button", { name: "Collect now" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /does not yet publish/,
    );
  });
});
