import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StewardSession } from "@/domain/auth/StewardSession";
import { AppShell } from "./AppShell";

function session(mode: StewardSession["mode"]): StewardSession {
  return {
    subject: "op-1",
    displayName: "Erin Example",
    orgId: mode === "DEMO" ? "demo-fintech" : "org-kilo",
    roles: ["APPROVER"],
    accessToken: null,
    mode,
  };
}

describe("AppShell — the activation point", () => {
  it("offers to connect the platform in demo mode, through the sign-in page", () => {
    render(<AppShell session={session("DEMO")}>content</AppShell>);

    expect(screen.getByText("Demo evidence")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Connect your platform/ }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("offers nothing to connect once the platform is connected", () => {
    render(<AppShell session={session("LIVE")}>content</AppShell>);

    expect(screen.getByText("Live evidence")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Connect your platform/ }),
    ).not.toBeInTheDocument();
  });
});
