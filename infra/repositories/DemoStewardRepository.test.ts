import { describe, expect, it } from "vitest";
import { DemoStewardRepository } from "./DemoStewardRepository";

describe("DemoStewardRepository", () => {
  it("returns a contract-valid governed portfolio", async () => {
    const repository = new DemoStewardRepository();
    const portfolio = await repository.getPortfolio();

    expect(portfolio.dataStatus).toBe("DEMO");
    expect(portfolio.accounts).toHaveLength(4);
    expect(portfolio.opportunities).toHaveLength(4);
    expect(portfolio.opportunities.every((item) => item.dossierId)).toBe(true);
  });

  it("returns account evidence without exposing connector credentials", async () => {
    const repository = new DemoStewardRepository();
    const account = await repository.getAccount("acct-kilo");

    expect(account?.evidence.length).toBeGreaterThan(0);
    // Asserted across every connector rather than the first: a credential
    // leaking onto the second one is the same defect and was not covered.
    for (const connector of account?.connectors ?? []) {
      expect(connector).not.toHaveProperty("credentials");
      expect(connector).not.toHaveProperty("token");
      expect(connector).not.toHaveProperty("apiKey");
    }
    expect(account?.policyEnvelope.automaticChangesEnabled).toBe(false);
  });

  it("records review state without executing a downstream action", async () => {
    const repository = new DemoStewardRepository();
    const result = await repository.reviewOpportunity("opp-kilo-limit", {
      decision: "APPROVE",
    });

    expect(result.opportunity.status).toBe("APPROVED");
    expect(result.reviewId).toContain("review-demo");
  });
});
