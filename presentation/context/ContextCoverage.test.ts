/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import { DemoStewardData } from "@/infra/demo/DemoStewardData";
import { ContextCoverage } from "./ContextCoverage";

function signal(
  id: string,
  freshness: EvidenceSignal["freshness"],
  contextClass?: EvidenceSignal["contextClass"],
): EvidenceSignal {
  return {
    id,
    title: id,
    detail: id,
    source: "Product usage",
    sourceRecordId: `${id}-record`,
    observedAt: new Date().toISOString(),
    freshness,
    confidence: 0.9,
    impact: "NEUTRAL",
    category: "USAGE",
    ...(contextClass ? { contextClass } : {}),
  };
}

function byClass(summary: ReturnType<ContextCoverage["summarize"]>) {
  return Object.fromEntries(
    summary.classes.map((entry) => [entry.contextClass, entry.coverage]),
  );
}

describe("ContextCoverage — when it may render", () => {
  it("is unclassified when nothing is linked", () => {
    const summary = new ContextCoverage(
      [],
      [signal("a", "LIVE", "INTENT")],
    ).summarize();
    expect(summary.classified).toBe(false);
  });

  it("is unclassified when any linked signal lacks a class, and never guesses", () => {
    const summary = new ContextCoverage(
      ["a", "b"],
      [signal("a", "LIVE", "INTENT"), signal("b", "LIVE")],
    ).summarize();
    expect(summary.classified).toBe(false);
  });

  it("ignores evidence the recommendation does not link", () => {
    const summary = new ContextCoverage(
      ["a"],
      [signal("a", "LIVE", "INTENT"), signal("unlinked", "STALE", "POLICY")],
    ).summarize();
    expect(summary.classified).toBe(true);
    expect(byClass(summary).POLICY).toBe("ABSENT");
  });
});

describe("ContextCoverage — states", () => {
  it("reports CURRENT when any signal of the class is live or current, AGING when only aging or stale, ABSENT otherwise", () => {
    const summary = new ContextCoverage(
      ["a", "b", "c", "d"],
      [
        signal("a", "STALE", "INTENT"),
        signal("b", "CURRENT", "INTENT"),
        signal("c", "AGING", "POLICY"),
        signal("d", "STALE", "POLICY"),
      ],
    ).summarize();

    expect(byClass(summary)).toEqual({
      JOURNEY: "ABSENT",
      INTENT: "CURRENT",
      FRICTION: "ABSENT",
      OPERATIONAL: "ABSENT",
      POLICY: "AGING",
    });
    expect(summary.covered).toBe(1);
    expect(summary.total).toBe(5);
  });
});

describe("ContextCoverage — against the demo fixtures", () => {
  function fixture(accountId: string) {
    const account = DemoStewardData.account(accountId);
    const opportunity = DemoStewardData.opportunities().find(
      (candidate) => candidate.accountId === accountId,
    );
    if (!account || !opportunity) throw new Error(`no fixture ${accountId}`);
    return new ContextCoverage(
      opportunity.evidenceIds,
      account.evidence,
    ).summarize();
  }

  it("reads Kilo's expansion as intent, policy and journey current, with no friction or operational signal", () => {
    const summary = fixture("acct-kilo");
    expect(summary.classified).toBe(true);
    expect(byClass(summary)).toEqual({
      JOURNEY: "CURRENT",
      INTENT: "CURRENT",
      FRICTION: "ABSENT",
      OPERATIONAL: "ABSENT",
      POLICY: "CURRENT",
    });
  });

  it("reads Tango's hold as policy aging", () => {
    const summary = fixture("acct-tango");
    expect(byClass(summary).POLICY).toBe("AGING");
    expect(byClass(summary).INTENT).toBe("CURRENT");
    expect(summary.covered).toBe(1);
  });
});
