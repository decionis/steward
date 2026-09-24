import { describe, expect, it } from "vitest";
import { DemoStewardData } from "./DemoStewardData";
import { PortfolioSnapshotSchema } from "@/domain/portfolio/PortfolioSnapshot";
import { CustomerAccountSchema } from "@/domain/accounts/CustomerAccount";

/**
 * Provenance guards.
 *
 * These fixtures are published in a public repository, so "no real customer
 * data is in here" has to be a property the build checks rather than a claim
 * somebody made once. The conventions asserted below are documented at the top
 * of DemoStewardData.ts; if a future fixture breaks one of them, that is the point
 * at which someone should be asked where the data came from.
 */

const NATO = [
  "Alfa",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
  "Kilo",
  "Lima",
  "Mike",
  "November",
  "Oscar",
  "Papa",
  "Quebec",
  "Romeo",
  "Sierra",
  "Tango",
  "Uniform",
  "Victor",
  "Whiskey",
  "Xray",
  "Yankee",
  "Zulu",
];

const portfolio = DemoStewardData.portfolio();
const accounts = portfolio.accounts.map((summary) =>
  DemoStewardData.account(summary.id),
);

describe("DemoStewardData — provenance", () => {
  it("names every organisation from the NATO phonetic alphabet", () => {
    // No payments company is plausibly named this way, so a fixture cannot
    // collide with a real customer by coincidence.
    for (const account of portfolio.accounts) {
      const firstWord = account.name.split(" ")[0];
      expect(NATO, `${account.name} is not obviously generated`).toContain(
        firstWord,
      );
    }
  });

  it("gives every person the reserved Example surname", () => {
    // After the IANA-reserved example.com of RFC 2606. These are not employees
    // or customer contacts, and the repetition is the signal.
    for (const account of portfolio.accounts) {
      expect(account.owner, `${account.owner} is not an example name`).toMatch(
        /^[A-Z][a-z]+ Example$/,
      );
    }
  });

  it("uses sequential external references, not CRM-shaped identifiers", () => {
    for (const account of portfolio.accounts) {
      expect(account.externalReference).toMatch(/^CRM-DEMO-\d{4}$/);
    }
  });

  it("contains no email address, phone number, or URL", () => {
    // The cheapest way for something real to arrive is inside a free-text
    // detail or rationale field.
    const serialized = JSON.stringify({ portfolio, accounts });

    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/\+\d[\d\s().-]{7,}/);
  });

  it("marks the snapshot as DEMO so the interface can say so", () => {
    expect(portfolio.dataStatus).toBe("DEMO");
  });
});

describe("DemoStewardData — freshness", () => {
  // Timestamps are relative to read time. They were absolute until
  // StewardFormat.relativeTime stopped defaulting `now` to a hardcoded date, at
  // which point the demo started rendering "Jul 10" everywhere — a public demo
  // that looks abandoned. This fails if anyone reintroduces a fixed instant.
  const HOUR = 60 * 60 * 1000;

  it("generates the snapshot at read time", () => {
    const age = Date.now() - new Date(portfolio.generatedAt).getTime();
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(HOUR);
  });

  it("dates every opportunity within the last day", () => {
    for (const opportunity of portfolio.opportunities) {
      const age = Date.now() - new Date(opportunity.createdAt).getTime();
      expect(age, `${opportunity.id} is not recent`).toBeLessThan(24 * HOUR);
      expect(age).toBeGreaterThanOrEqual(0);
    }
  });

  it("never dates a fixture in the future", () => {
    // A future timestamp renders as "in 3 hours", which reads as a bug.
    const stamps = JSON.stringify({ portfolio, accounts }).match(
      /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,
    );
    for (const stamp of stamps ?? []) {
      expect(new Date(stamp).getTime()).toBeLessThanOrEqual(Date.now());
    }
  });
});

describe("DemoStewardData — contract validity", () => {
  it("produces a portfolio that satisfies the published schema", () => {
    // The fixtures are the only data a reviewer running the demo will see, so
    // they must satisfy the same contracts as a live upstream response.
    expect(() => PortfolioSnapshotSchema.parse(portfolio)).not.toThrow();
  });

  it("produces accounts that satisfy the published schema", () => {
    for (const account of accounts) {
      expect(account).not.toBeNull();
      expect(() => CustomerAccountSchema.parse(account)).not.toThrow();
    }
  });

  it("keeps the portfolio summary consistent with the accounts it lists", () => {
    // A summary that disagrees with its own rows undermines the one claim the
    // dashboard makes.
    const byState = (state: string) =>
      portfolio.accounts.filter((account) => account.state === state).length;

    expect(portfolio.summary.totalAccounts).toBe(portfolio.accounts.length);
    expect(portfolio.summary.healthyAccounts).toBe(byState("HEALTHY"));
    expect(portfolio.summary.accountsWithFriction).toBe(byState("FRICTION"));
    expect(portfolio.summary.expansionReady).toBe(byState("EXPANSION_READY"));

    const average = Math.round(
      portfolio.accounts.reduce(
        (total, account) => total + account.evidenceCoverage,
        0,
      ) / portfolio.accounts.length,
    );
    expect(portfolio.summary.averageEvidenceCoverage).toBe(average);
  });

  it("points every opportunity at an account that exists", () => {
    const ids = new Set(portfolio.accounts.map((account) => account.id));

    for (const opportunity of portfolio.opportunities) {
      expect(ids).toContain(opportunity.accountId);
      const account = portfolio.accounts.find(
        (candidate) => candidate.id === opportunity.accountId,
      );
      expect(opportunity.accountName).toBe(account?.name);
    }
  });

  it("references only evidence that exists on the named account", () => {
    for (const opportunity of portfolio.opportunities) {
      const account = accounts.find(
        (candidate) => candidate?.id === opportunity.accountId,
      );
      const available = new Set(
        account?.evidence.map((signal) => signal.id) ?? [],
      );

      for (const evidenceId of opportunity.evidenceIds) {
        expect(
          available,
          `${evidenceId} is not on ${opportunity.accountId}`,
        ).toContain(evidenceId);
      }
    }
  });

  it("never enables automatic downstream changes", () => {
    // The trust boundary the interface claims: Steward records reviews, it does not
    // apply them. A fixture that enabled this would contradict the product.
    for (const account of accounts) {
      expect(account?.policyEnvelope.automaticChangesEnabled).toBe(false);
      expect(account?.policyEnvelope.maximumAutoIncreasePercent).toBe(0);
    }
  });
});

describe("DemoStewardData — context classes", () => {
  // The fixtures set the bar for what a good upstream response looks like.
  // A live response may omit the class until the platform ships it; the demo
  // may not, or nobody evaluating Steward ever sees the distinction.
  const signals = accounts.flatMap((account) => account?.evidence ?? []);

  it("classifies every signal", () => {
    for (const signal of signals) {
      expect(signal.contextClass, `${signal.id} has no class`).toBeDefined();
    }
  });

  it("exercises every class the contract allows", () => {
    const present = new Set(signals.map((signal) => signal.contextClass));
    for (const contextClass of [
      "JOURNEY",
      "INTENT",
      "FRICTION",
      "OPERATIONAL",
      "POLICY",
    ]) {
      expect(present, `no fixture is ${contextClass}`).toContain(contextClass);
    }
  });
});
