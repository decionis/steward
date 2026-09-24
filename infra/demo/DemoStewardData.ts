import type { CustomerAccount } from "@/domain/accounts/CustomerAccount";
import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";
import type { PortfolioSnapshot } from "@/domain/portfolio/PortfolioSnapshot";

/**
 * Demo fixtures. Every value in this file is invented.
 *
 * This is the one file in a public repository shaped like customer data, so its
 * provenance is made true by construction rather than asserted after the fact.
 * Three conventions do that work, and `DemoStewardData.test.ts` enforces them:
 *
 *   Organisations use the NATO phonetic alphabet — Kilo, Sierra, Tango, Victor.
 *   A reader recognises generated data on sight, and no payments company is
 *   plausibly named this way, so a coincidental collision with a real customer
 *   cannot occur.
 *
 *   People use the `Example` surname, after the IANA-reserved example.com of
 *   RFC 2606. The repetition is deliberate: it is the signal. These are not
 *   employees, customer contacts, or anyone else.
 *
 *   External references are sequential (`CRM-DEMO-0001`), not shaped like a
 *   real CRM identifier. The previous fixtures used Salesforce-style ids, which
 *   read as though they had been copied from somewhere.
 *
 * Connector names are generic capabilities rather than vendor products, so the
 * demo does not imply commercial integrations that do not exist.
 *
 * Adding a fixture: invent it. Never adapt one from a real account, even with
 * the names changed — corridors, limits and utilisation patterns identify an
 * organisation as readily as its name does.
 */

/**
 * Timestamps are relative to the moment the fixtures are read, not fixed
 * instants, so the demo reads as a live snapshot however long after release
 * someone opens it.
 *
 * They were absolute until `StewardFormat.relativeTime` stopped defaulting `now` to
 * a hardcoded date (issue #17). With a real clock, fixed fixture timestamps
 * rendered as "Jul 10" — a public demo that looks abandoned.
 */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function buildAccounts(): CustomerAccount[] {
  return [
    {
      id: "acct-kilo",
      name: "Kilo Payments",
      externalReference: "CRM-DEMO-0001",
      segment: "Enterprise",
      primaryRegion: "United Kingdom",
      corridors: ["UK → NG", "UK → KE"],
      state: "EXPANSION_READY",
      owner: "Alice Example",
      healthScore: 91,
      evidenceCoverage: 94,
      limitUtilization: 92,
      currentLimit: { amount: 500000, currency: "GBP" },
      proposedLimit: { amount: 650000, currency: "GBP" },
      updatedAt: ago(6),
      connectors: [
        {
          id: "conn-kilo-crm",
          name: "CRM",
          health: "HEALTHY",
          lastSyncAt: ago(10),
        },
        {
          id: "conn-kilo-usage",
          name: "Product usage",
          health: "HEALTHY",
          lastSyncAt: ago(6),
        },
        {
          id: "conn-kilo-settlement",
          name: "Settlement ledger",
          health: "HEALTHY",
          lastSyncAt: ago(7),
        },
        {
          id: "conn-kilo-support",
          name: "Support desk",
          health: "HEALTHY",
          lastSyncAt: ago(12),
        },
      ],
      evidence: [
        {
          id: "ev-kilo-usage",
          title: "Processing velocity reached 92%",
          detail:
            "Seven-day settled volume is 31% above the prior four-week baseline without an increase in exception rate.",
          source: "Product usage",
          sourceRecordId: "usage-kilo-20260710",
          observedAt: ago(6),
          freshness: "LIVE",
          confidence: 0.98,
          impact: "POSITIVE",
          category: "USAGE",
          contextClass: "INTENT",
        },
        {
          id: "ev-kilo-kyb",
          title: "Partner KYB refreshed",
          detail:
            "Beneficial ownership and sanctions screening completed for the two new corridor partners.",
          source: "KYC / KYB",
          sourceRecordId: "kyb-kilo-20260705",
          observedAt: ago(7578),
          freshness: "CURRENT",
          confidence: 0.95,
          impact: "POSITIVE",
          category: "KYC_KYB",
          contextClass: "POLICY",
        },
        {
          id: "ev-kilo-milestone",
          title: "Expansion milestone recorded",
          detail:
            "Contracted volume commitment for the second half of the year was signed and logged against the account.",
          source: "CRM",
          sourceRecordId: "crm-kilo-20260702",
          observedAt: ago(11750),
          freshness: "CURRENT",
          confidence: 0.9,
          impact: "POSITIVE",
          category: "CRM",
          contextClass: "JOURNEY",
        },
        {
          id: "ev-kilo-exceptions",
          title: "Exception rate steady at 0.4%",
          detail:
            "No material change in settlement exceptions across the volume increase.",
          source: "Settlement ledger",
          sourceRecordId: "settle-kilo-20260709",
          observedAt: ago(1045),
          freshness: "CURRENT",
          confidence: 0.93,
          impact: "NEUTRAL",
          category: "TRANSACTION",
          contextClass: "OPERATIONAL",
        },
      ],
      timeline: [
        {
          id: "tl-kilo-0",
          title: "Previous limit increase applied",
          detail:
            "The £400k → £500k increase approved on the prior review was executed under grant; utilisation settled at 71% of the new envelope.",
          occurredAt: ago(1320),
          kind: "OUTCOME",
        },
        {
          id: "tl-kilo-1",
          title: "Utilisation crossed the review threshold",
          detail:
            "Rolling utilisation passed 90% of the agreed processing envelope.",
          occurredAt: ago(6),
          kind: "SIGNAL",
        },
        {
          id: "tl-kilo-2",
          title: "Policy evaluated the account as review-required",
          detail:
            "The active customer operations policy routed the increase to human approval rather than applying it.",
          occurredAt: ago(5),
          kind: "DECISION",
        },
        {
          id: "tl-kilo-3",
          title: "Queued for operator review",
          detail: "Recommendation surfaced in the governed action queue.",
          occurredAt: ago(5),
          kind: "ACTION",
        },
      ],
      policyEnvelope: {
        policyVersion: "customer_ops.v4",
        maximumAutoIncreasePercent: 0,
        reviewThreshold: { amount: 250000, currency: "GBP" },
        automaticChangesEnabled: false,
      },
    },
    {
      id: "acct-sierra",
      name: "Sierra Treasury",
      externalReference: "CRM-DEMO-0002",
      segment: "Enterprise",
      primaryRegion: "United States",
      corridors: ["US → MX", "US → PH"],
      state: "FRICTION",
      owner: "Bob Example",
      healthScore: 62,
      evidenceCoverage: 87,
      limitUtilization: 54,
      currentLimit: { amount: 1200000, currency: "USD" },
      proposedLimit: null,
      updatedAt: ago(18),
      connectors: [
        {
          id: "conn-sierra-crm",
          name: "CRM",
          health: "HEALTHY",
          lastSyncAt: ago(25),
        },
        {
          id: "conn-sierra-usage",
          name: "Product usage",
          health: "HEALTHY",
          lastSyncAt: ago(19),
        },
        {
          id: "conn-sierra-settlement",
          name: "Settlement ledger",
          health: "DEGRADED",
          lastSyncAt: ago(110),
        },
        {
          id: "conn-sierra-support",
          name: "Support desk",
          health: "HEALTHY",
          lastSyncAt: ago(18),
        },
      ],
      evidence: [
        {
          id: "ev-sierra-tickets",
          title: "Support contacts up 3.4x on one corridor",
          detail:
            "Ticket volume concentrated on US → MX, with settlement delay as the dominant reason code.",
          source: "Support desk",
          sourceRecordId: "support-sierra-20260710",
          observedAt: ago(18),
          freshness: "LIVE",
          confidence: 0.94,
          impact: "NEGATIVE",
          category: "SUPPORT",
          contextClass: "FRICTION",
        },
        {
          id: "ev-sierra-completion",
          title: "Completion rate fell to 96.1%",
          detail:
            "Corridor completion dropped 2.7 points against baseline over four days.",
          source: "Settlement ledger",
          sourceRecordId: "settle-sierra-20260710",
          observedAt: ago(110),
          freshness: "CURRENT",
          confidence: 0.91,
          impact: "NEGATIVE",
          category: "TRANSACTION",
          contextClass: "OPERATIONAL",
        },
        {
          id: "ev-sierra-sync",
          title: "Settlement ledger sync degraded",
          detail:
            "The connector is returning partial pages; figures may lag by up to two hours.",
          source: "Settlement ledger",
          sourceRecordId: "settle-sierra-health",
          observedAt: ago(109),
          freshness: "AGING",
          confidence: 0.72,
          impact: "NEUTRAL",
          category: "TRANSACTION",
          contextClass: "OPERATIONAL",
        },
      ],
      timeline: [
        {
          id: "tl-sierra-1",
          title: "Support volume anomaly detected",
          detail:
            "Corridor-scoped ticket spike exceeded the alerting threshold.",
          occurredAt: ago(18),
          kind: "SIGNAL",
        },
        {
          id: "tl-sierra-2",
          title: "Correlated with a settlement completion drop",
          detail:
            "Support and transaction evidence agreed on the same corridor and window.",
          occurredAt: ago(17),
          kind: "SIGNAL",
        },
        {
          id: "tl-sierra-3",
          title: "Escalation recommended",
          detail:
            "Policy routed the account to an operations incident rather than an automated response.",
          occurredAt: ago(16),
          kind: "DECISION",
        },
      ],
      policyEnvelope: {
        policyVersion: "customer_ops.v4",
        maximumAutoIncreasePercent: 0,
        reviewThreshold: { amount: 500000, currency: "USD" },
        automaticChangesEnabled: false,
      },
    },
    {
      id: "acct-tango",
      name: "Tango Trade Services",
      externalReference: "CRM-DEMO-0003",
      segment: "Mid-market",
      primaryRegion: "Singapore",
      corridors: ["SG → ID", "SG → VN"],
      state: "REVIEW_REQUIRED",
      owner: "Carol Example",
      healthScore: 74,
      evidenceCoverage: 69,
      limitUtilization: 88,
      currentLimit: { amount: 300000, currency: "SGD" },
      proposedLimit: { amount: 400000, currency: "SGD" },
      updatedAt: ago(120),
      connectors: [
        {
          id: "conn-tango-crm",
          name: "CRM",
          health: "HEALTHY",
          lastSyncAt: ago(28),
        },
        {
          id: "conn-tango-usage",
          name: "Product usage",
          health: "HEALTHY",
          lastSyncAt: ago(21),
        },
        {
          id: "conn-tango-kyb",
          name: "KYC / KYB",
          health: "STALE",
          lastSyncAt: ago(119970),
        },
        {
          id: "conn-tango-support",
          name: "Support desk",
          health: "HEALTHY",
          lastSyncAt: ago(35),
        },
      ],
      evidence: [
        {
          id: "ev-tango-usage",
          title: "Utilisation sustained above 85%",
          detail:
            "Three consecutive weeks above the review threshold with a stable exception rate.",
          source: "Product usage",
          sourceRecordId: "usage-tango-20260710",
          observedAt: ago(21),
          freshness: "LIVE",
          confidence: 0.96,
          impact: "POSITIVE",
          category: "USAGE",
          contextClass: "INTENT",
        },
        {
          id: "ev-tango-kyb",
          title: "Beneficial ownership evidence is stale",
          detail:
            "The most recent verified record predates the active policy's 90-day freshness requirement.",
          source: "KYC / KYB",
          sourceRecordId: "kyb-tango-20260418",
          observedAt: ago(119970),
          freshness: "STALE",
          confidence: 0.99,
          impact: "NEGATIVE",
          category: "KYC_KYB",
          contextClass: "POLICY",
        },
        {
          id: "ev-tango-support",
          title: "No open support themes",
          detail: "No recurring reason codes across the last 60 days.",
          source: "Support desk",
          sourceRecordId: "support-tango-20260710",
          observedAt: ago(35),
          freshness: "CURRENT",
          confidence: 0.88,
          impact: "POSITIVE",
          category: "SUPPORT",
          contextClass: "FRICTION",
        },
      ],
      timeline: [
        {
          id: "tl-tango-1",
          title: "Expansion review triggered by utilisation",
          detail: "Sustained utilisation met the criteria for a limit review.",
          occurredAt: ago(122),
          kind: "SIGNAL",
        },
        {
          id: "tl-tango-2",
          title: "Policy blocked on evidence freshness",
          detail:
            "The KYB record is outside the freshness window the active policy requires.",
          occurredAt: ago(120),
          kind: "DECISION",
        },
      ],
      policyEnvelope: {
        policyVersion: "customer_ops.v4",
        maximumAutoIncreasePercent: 0,
        reviewThreshold: { amount: 150000, currency: "SGD" },
        automaticChangesEnabled: false,
      },
    },
    {
      id: "acct-victor",
      name: "Victor Remit",
      externalReference: "CRM-DEMO-0004",
      segment: "Mid-market",
      primaryRegion: "Norway",
      corridors: ["NO → PL"],
      state: "HEALTHY",
      owner: "Dave Example",
      healthScore: 88,
      evidenceCoverage: 78,
      limitUtilization: 41,
      currentLimit: { amount: 900000, currency: "NOK" },
      proposedLimit: null,
      updatedAt: ago(205),
      connectors: [
        {
          id: "conn-victor-crm",
          name: "CRM",
          health: "HEALTHY",
          lastSyncAt: ago(210),
        },
        {
          id: "conn-victor-usage",
          name: "Product usage",
          health: "HEALTHY",
          lastSyncAt: ago(205),
        },
        {
          id: "conn-victor-settlement",
          name: "Settlement ledger",
          health: "HEALTHY",
          lastSyncAt: ago(212),
        },
      ],
      evidence: [
        {
          id: "ev-victor-usage",
          title: "Volume steady against baseline",
          detail:
            "No material variance in settled volume or exception rate over 30 days.",
          source: "Product usage",
          sourceRecordId: "usage-victor-20260710",
          observedAt: ago(205),
          freshness: "CURRENT",
          confidence: 0.92,
          impact: "NEUTRAL",
          category: "USAGE",
          contextClass: "INTENT",
        },
        {
          id: "ev-victor-kyb",
          title: "KYB current",
          detail: "Verified within the policy freshness window.",
          source: "KYC / KYB",
          sourceRecordId: "kyb-victor-20260612",
          observedAt: ago(40620),
          freshness: "CURRENT",
          confidence: 0.97,
          impact: "POSITIVE",
          category: "KYC_KYB",
          contextClass: "POLICY",
        },
      ],
      timeline: [
        {
          id: "tl-victor-1",
          title: "Routine evidence refresh",
          detail: "All connected sources reported healthy with no new signals.",
          occurredAt: ago(205),
          kind: "OUTCOME",
        },
        {
          id: "tl-victor-2",
          title: "Policy assessed the account as needing no action",
          detail:
            "Evidence is current and inside the envelope. The active policy recorded a deliberate no-action decision rather than leaving the account unassessed.",
          occurredAt: ago(200),
          kind: "DECISION",
        },
      ],
      policyEnvelope: {
        policyVersion: "customer_ops.v4",
        maximumAutoIncreasePercent: 0,
        reviewThreshold: { amount: 400000, currency: "NOK" },
        automaticChangesEnabled: false,
      },
    },
  ];
}

function buildOpportunities(): CustomerOpportunity[] {
  return [
    {
      id: "opp-kilo-limit",
      accountId: "acct-kilo",
      accountName: "Kilo Payments",
      kind: "PROCESSING_LIMIT_REVIEW",
      status: "OPEN",
      title: "Review a £150k processing-limit increase",
      rationale:
        "Usage velocity, completed partner KYB and the recorded expansion milestone support a controlled increase. Human approval remains required in shadow mode.",
      recommendedAction:
        "Review a time-bound increase from £500k to £650k for the UK → NG corridor.",
      disposition: "REVIEW",
      confidence: 0.93,
      evidenceCoverage: 94,
      evidenceIds: ["ev-kilo-usage", "ev-kilo-kyb", "ev-kilo-milestone"],
      priority: "ELEVATED",
      createdAt: ago(5),
      dossierId: "dos_demo_kilo_01",
      arbitration: {
        governingClass: "POLICY",
        governingEvidenceIds: ["ev-kilo-kyb"],
        overriddenEvidenceIds: [],
        suppressedActions: [],
        policyReference: "customer_ops.v4",
        summary:
          "The increase exceeds the review threshold, so the active policy routes it to human approval rather than applying it. Partner KYB is current, which is what allows a review rather than a block.",
      },
    },
    {
      // A decision that reached its outcome. The timeline draws the loop
      // (SIGNAL, DECISION, ACTION, OUTCOME) but nothing closed it on screen:
      // the queue showed what needed a decision and nothing showed what a
      // decision produced. This is the prior review that set Kilo's current
      // £500k envelope. It sits after the open recommendation on purpose:
      // history follows the live decision, and lookups that take the first
      // opportunity of a kind or an account keep finding the open one.
      id: "opp-kilo-limit-prior",
      accountId: "acct-kilo",
      accountName: "Kilo Payments",
      kind: "PROCESSING_LIMIT_REVIEW",
      status: "COMPLETED",
      title: "Processing limit raised to £500k",
      rationale:
        "Sustained utilisation above the review threshold with a stable exception rate and current partner KYB supported a controlled increase from £400k.",
      recommendedAction:
        "Approved and executed under grant. Utilisation settled at 71% of the new envelope before the current velocity rise.",
      disposition: "ALLOW",
      confidence: 0.95,
      evidenceCoverage: 91,
      evidenceIds: ["ev-kilo-exceptions", "ev-kilo-kyb"],
      priority: "ROUTINE",
      createdAt: ago(1380),
      dossierId: "dos_demo_kilo_00",
    },
    {
      id: "opp-sierra-friction",
      accountId: "acct-sierra",
      accountName: "Sierra Treasury",
      kind: "FRICTION_INTERVENTION",
      status: "OPEN",
      title: "Assign the US settlement incident",
      rationale:
        "A concentrated support-ticket increase aligns with a corridor-specific fall in completion rate.",
      recommendedAction:
        "Create an operations incident, notify the account owner and hold expansion outreach until settlement health recovers.",
      disposition: "ESCALATE",
      confidence: 0.91,
      evidenceCoverage: 87,
      evidenceIds: ["ev-sierra-tickets", "ev-sierra-completion"],
      priority: "URGENT",
      createdAt: ago(16),
      dossierId: "dos_demo_sierra_01",
      arbitration: {
        governingClass: "OPERATIONAL",
        governingEvidenceIds: ["ev-sierra-completion"],
        overriddenEvidenceIds: [],
        suppressedActions: ["Expansion outreach"],
        policyReference: "customer_ops.v4",
        summary:
          "A corridor-specific fall in completion rate, corroborated by support volume, is an active service condition. The policy escalates to an operations incident and suppresses commercial outreach while it persists.",
      },
    },
    {
      id: "opp-tango-hold",
      accountId: "acct-tango",
      accountName: "Tango Trade Services",
      kind: "HOLD_FOR_MORE_EVIDENCE",
      status: "OPEN",
      title: "Hold expansion pending KYB refresh",
      rationale:
        "Utilisation supports an expansion review, but beneficial-ownership evidence is stale under the active policy.",
      recommendedAction:
        "Request a KYB refresh and resume the limit review when evidence is current.",
      disposition: "BLOCK",
      confidence: 0.89,
      evidenceCoverage: 69,
      evidenceIds: ["ev-tango-usage", "ev-tango-kyb"],
      priority: "ROUTINE",
      createdAt: ago(120),
      dossierId: "dos_demo_tango_01",
      arbitration: {
        governingClass: "POLICY",
        governingEvidenceIds: ["ev-tango-kyb"],
        overriddenEvidenceIds: ["ev-tango-usage"],
        suppressedActions: ["Processing-limit review"],
        policyReference: "customer_ops.v4",
        summary:
          "Beneficial-ownership evidence is outside the 90-day freshness window the active policy requires. Utilisation supports a review and is overridden until the record is refreshed.",
      },
    },
    {
      // Inaction is a decision. This fixture exists so the demo shows the
      // platform choosing not to intervene, with the evidence that supported
      // the choice and a dossier recording it, rather than showing a healthy
      // account as simply having nothing to say.
      id: "opp-victor-no-action",
      accountId: "acct-victor",
      accountName: "Victor Remit",
      kind: "NO_ACTION",
      status: "OPEN",
      title: "No intervention warranted",
      rationale:
        "Settled volume and exception rate are steady against a 30-day baseline, and KYB is verified inside the policy freshness window. The policy assessed the account and chose inaction, with the evidence recorded.",
      recommendedAction:
        "Take no action. Continue routine evidence refresh and re-evaluate on any material change.",
      disposition: "ALLOW",
      confidence: 0.9,
      evidenceCoverage: 78,
      evidenceIds: ["ev-victor-usage", "ev-victor-kyb"],
      priority: "ROUTINE",
      createdAt: ago(200),
      dossierId: "dos_demo_victor_01",
      arbitration: {
        governingClass: "POLICY",
        governingEvidenceIds: ["ev-victor-kyb", "ev-victor-usage"],
        overriddenEvidenceIds: [],
        suppressedActions: [],
        policyReference: "customer_ops.v4",
        summary:
          "Volume is steady inside the envelope and KYB is current, so the active policy recorded a deliberate no-action decision rather than leaving the account unassessed.",
      },
    },
  ];
}

export class DemoStewardData {
  static portfolio(): PortfolioSnapshot {
    const accounts = buildAccounts();
    const opportunities = buildOpportunities();

    return {
      generatedAt: ago(0),
      dataStatus: "DEMO",
      summary: {
        totalAccounts: accounts.length,
        healthyAccounts: 1,
        accountsWithFriction: 1,
        expansionReady: 1,
        reviewsRequired: 2,
        averageEvidenceCoverage: 82,
      },
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        externalReference: account.externalReference,
        segment: account.segment,
        primaryRegion: account.primaryRegion,
        corridors: [...account.corridors],
        state: account.state,
        owner: account.owner,
        healthScore: account.healthScore,
        evidenceCoverage: account.evidenceCoverage,
        limitUtilization: account.limitUtilization,
        currentLimit: { ...account.currentLimit },
        proposedLimit: account.proposedLimit
          ? { ...account.proposedLimit }
          : null,
        updatedAt: account.updatedAt,
      })),
      opportunities: opportunities.map((opportunity) => ({ ...opportunity })),
    };
  }

  static account(accountId: string): CustomerAccount | null {
    const account = buildAccounts().find(
      (candidate) => candidate.id === accountId,
    );
    return account ? structuredClone(account) : null;
  }

  static opportunities(): CustomerOpportunity[] {
    return buildOpportunities().map((opportunity) => ({ ...opportunity }));
  }
}
