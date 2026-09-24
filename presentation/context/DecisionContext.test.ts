/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import type { ConnectorHealth } from "@/domain/accounts/CustomerAccount";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { DecisionContext } from "./DecisionContext";

function fixture(accountId: string) {
  const account = DemoStewardData.account(accountId);
  const opportunity = DemoStewardData.opportunities().find(
    (candidate) => candidate.accountId === accountId,
  );
  if (!account || !opportunity) throw new Error(`No fixture for ${accountId}`);
  return new DecisionContext(
    opportunity,
    account.evidence,
    account.connectors,
  ).summarize();
}

function signal(
  id: string,
  freshness: EvidenceSignal["freshness"],
  source = "Product usage",
): EvidenceSignal {
  return {
    id,
    title: id,
    detail: id,
    source,
    sourceRecordId: `${id}-record`,
    observedAt: new Date().toISOString(),
    freshness,
    confidence: 0.9,
    impact: "NEUTRAL",
    category: "USAGE",
  };
}

function connector(
  name: string,
  health: ConnectorHealth["health"],
): ConnectorHealth {
  return { id: name, name, health, lastSyncAt: null };
}

describe("DecisionContext — against the demo fixtures", () => {
  it("reads Kilo as steady: every linked signal fresh, every source healthy", () => {
    const summary = fixture("acct-kilo");

    expect(summary.tone).toBe("steady");
    expect(summary.agingOrStale).toEqual([]);
    expect(summary.unhealthySources).toEqual([]);
    expect(summary.headline).toBe(
      "All 3 linked signals are live or current; all sources healthy.",
    );
  });

  it("flags Sierra's degraded settlement ledger even though its linked evidence is fresh", () => {
    // The article's central case: an operational condition the card's
    // confidence badge says nothing about.
    const summary = fixture("acct-sierra");

    expect(summary.tone).toBe("attention");
    expect(summary.agingOrStale).toEqual([]);
    expect(summary.unhealthySources.map((c) => c.name)).toEqual([
      "Settlement ledger",
    ]);
    expect(summary.headline).toBe(
      "All 2 linked signals are live or current; Settlement ledger is degraded.",
    );
  });

  it("flags Tango's stale KYB signal and its stale connector", () => {
    const summary = fixture("acct-tango");

    expect(summary.tone).toBe("attention");
    expect(summary.weakestFreshness).toBe("STALE");
    expect(summary.headline).toBe(
      "1 of 2 linked signals is stale; KYC / KYB is stale.",
    );
  });
});

describe("DecisionContext — edge cases", () => {
  it("says so when a recommendation links no evidence at all", () => {
    const summary = new DecisionContext(
      { evidenceIds: [] },
      [signal("a", "LIVE")],
      [],
    ).summarize();

    expect(summary.tone).toBe("attention");
    expect(summary.weakestFreshness).toBeNull();
    expect(summary.headline).toBe("This recommendation links no evidence.");
  });

  it("says so when none of the linked ids are on the account", () => {
    const summary = new DecisionContext(
      { evidenceIds: ["missing"] },
      [signal("a", "LIVE")],
      [],
    ).summarize();

    expect(summary.tone).toBe("attention");
    expect(summary.missingEvidenceIds).toEqual(["missing"]);
    expect(summary.headline).toBe(
      "None of the evidence this recommendation links is on this account.",
    );
  });

  it("reports a partial mismatch alongside the freshness summary", () => {
    const summary = new DecisionContext(
      { evidenceIds: ["a", "missing"] },
      [signal("a", "CURRENT")],
      [connector("Product usage", "HEALTHY")],
    ).summarize();

    expect(summary.tone).toBe("attention");
    expect(summary.headline).toBe(
      "The linked signal is live or current; all sources healthy; 1 linked signal not found on this account.",
    );
  });

  it("names both aging and stale when both are present", () => {
    const summary = new DecisionContext(
      { evidenceIds: ["a", "b", "c"] },
      [signal("a", "LIVE"), signal("b", "AGING"), signal("c", "STALE")],
      [connector("Product usage", "HEALTHY")],
    ).summarize();

    expect(summary.weakestFreshness).toBe("STALE");
    expect(summary.headline).toBe(
      "2 of 3 linked signals are aging or stale; all sources healthy.",
    );
  });

  it("ignores unhealthy connectors that supply none of the linked evidence", () => {
    const summary = new DecisionContext(
      { evidenceIds: ["a"] },
      [signal("a", "LIVE", "CRM")],
      [connector("CRM", "HEALTHY"), connector("Support desk", "DISCONNECTED")],
    ).summarize();

    expect(summary.tone).toBe("steady");
    expect(summary.unhealthySources).toEqual([]);
  });

  it("lists every unhealthy source that supplies linked evidence", () => {
    const summary = new DecisionContext(
      { evidenceIds: ["a", "b"] },
      [signal("a", "LIVE", "CRM"), signal("b", "LIVE", "Support desk")],
      [connector("CRM", "STALE"), connector("Support desk", "DISCONNECTED")],
    ).summarize();

    expect(summary.headline).toBe(
      "All 2 linked signals are live or current; CRM is stale, Support desk is disconnected.",
    );
  });
});
