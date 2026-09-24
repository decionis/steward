import type { ConnectorHealth } from "@/domain/accounts/CustomerAccount";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";

type Freshness = EvidenceSignal["freshness"];

export type DecisionContextTone = "steady" | "attention";

export interface DecisionContextSummary {
  /** Linked evidence found on the account, in the order the opportunity lists it. */
  linked: EvidenceSignal[];
  /** Ids the opportunity links that the account's evidence does not contain. */
  missingEvidenceIds: string[];
  /** The weakest freshness among linked evidence; null when nothing is linked. */
  weakestFreshness: Freshness | null;
  /** Linked signals that are AGING or STALE. */
  agingOrStale: EvidenceSignal[];
  /** Connectors that supply linked evidence and report anything but HEALTHY. */
  unhealthySources: ConnectorHealth[];
  tone: DecisionContextTone;
  /** One sentence for the review panel. */
  headline: string;
}

const FRESHNESS_RANK: Record<Freshness, number> = {
  LIVE: 0,
  CURRENT: 1,
  AGING: 2,
  STALE: 3,
};

/**
 * Summarises the state of the context behind a recommendation at the moment
 * an operator reviews it: how fresh the linked evidence is, and whether the
 * sources that produced it are healthy.
 *
 * This is formatting policy, not decisioning. Every field it reports is
 * already on the page; it joins them into one sentence so an approver is not
 * left to correlate a confidence badge against a list of timestamps and a
 * separate panel of connector health. It has no opinion on whether to
 * approve, and it never derives a disposition. Architecture.md, "The decision
 * loop", is what licenses a summary in this layer and forbids anything more.
 */
export class DecisionContext {
  constructor(
    private readonly opportunity: Pick<CustomerOpportunity, "evidenceIds">,
    private readonly evidence: EvidenceSignal[],
    private readonly connectors: ConnectorHealth[],
  ) {}

  summarize(): DecisionContextSummary {
    const byId = new Map(this.evidence.map((signal) => [signal.id, signal]));
    const linked: EvidenceSignal[] = [];
    const missingEvidenceIds: string[] = [];

    for (const id of this.opportunity.evidenceIds) {
      const signal = byId.get(id);
      if (signal) linked.push(signal);
      else missingEvidenceIds.push(id);
    }

    const weakestFreshness = linked.reduce<Freshness | null>(
      (weakest, signal) =>
        weakest === null ||
        FRESHNESS_RANK[signal.freshness] > FRESHNESS_RANK[weakest]
          ? signal.freshness
          : weakest,
      null,
    );
    const agingOrStale = linked.filter(
      (signal) => signal.freshness === "AGING" || signal.freshness === "STALE",
    );
    const sources = new Set(linked.map((signal) => signal.source));
    const unhealthySources = this.connectors.filter(
      (connector) =>
        sources.has(connector.name) && connector.health !== "HEALTHY",
    );

    const tone: DecisionContextTone =
      linked.length === 0 ||
      missingEvidenceIds.length > 0 ||
      agingOrStale.length > 0 ||
      unhealthySources.length > 0
        ? "attention"
        : "steady";

    return {
      linked,
      missingEvidenceIds,
      weakestFreshness,
      agingOrStale,
      unhealthySources,
      tone,
      headline: DecisionContext.headline({
        linked,
        missingEvidenceIds,
        agingOrStale,
        unhealthySources,
      }),
    };
  }

  private static headline({
    linked,
    missingEvidenceIds,
    agingOrStale,
    unhealthySources,
  }: Pick<
    DecisionContextSummary,
    "linked" | "missingEvidenceIds" | "agingOrStale" | "unhealthySources"
  >): string {
    if (linked.length === 0) {
      return missingEvidenceIds.length === 0
        ? "This recommendation links no evidence."
        : "None of the evidence this recommendation links is on this account.";
    }

    const parts: string[] = [];

    if (agingOrStale.length === 0) {
      parts.push(
        linked.length === 1
          ? "The linked signal is live or current"
          : `All ${linked.length} linked signals are live or current`,
      );
    } else {
      const words = ["AGING", "STALE"]
        .filter((freshness) =>
          agingOrStale.some((signal) => signal.freshness === freshness),
        )
        .map((freshness) => freshness.toLowerCase())
        .join(" or ");
      const verb = agingOrStale.length === 1 ? "is" : "are";
      parts.push(
        `${agingOrStale.length} of ${linked.length} linked signals ${verb} ${words}`,
      );
    }

    parts.push(
      unhealthySources.length === 0
        ? "all sources healthy"
        : unhealthySources
            .map(
              (connector) =>
                `${connector.name} is ${connector.health.toLowerCase()}`,
            )
            .join(", "),
    );

    if (missingEvidenceIds.length > 0) {
      const missing = missingEvidenceIds.length;
      parts.push(
        `${missing} linked ${missing === 1 ? "signal" : "signals"} not found on this account`,
      );
    }

    return `${parts.join("; ")}.`;
  }
}
