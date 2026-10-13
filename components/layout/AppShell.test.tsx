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

describe("AppShell — signing out", () => {
  it("offers sign-out, as a form, to a session that came through kloakware", () => {
    render(
      <AppShell session={{ ...session("LIVE"), signedInThrough: "KLOAKWARE" }}>
        content
      </AppShell>,
    );

    const button = screen.getByRole("button", { name: /Sign out/ });
    expect(button.closest("form")).toHaveAttribute(
      "action",
      "/api/auth/oidc/sign-out",
    );
    expect(button.closest("form")).toHaveAttribute("method", "post");
  });

  it("offers no sign-out to the handoff or the demo, which end elsewhere", () => {
    render(
      <AppShell session={{ ...session("LIVE"), signedInThrough: "DECIONIS" }}>
        content
      </AppShell>,
    );
    expect(
      screen.queryByRole("button", { name: /Sign out/ }),
    ).not.toBeInTheDocument();
  });
});
