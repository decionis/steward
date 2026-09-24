import { FileKey2, Radar } from "lucide-react";
import type { ConnectorHealth } from "@/domain/accounts/CustomerAccount";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReviewAction } from "@/components/dashboard/ReviewAction";
import { DecisionContext } from "@/presentation/context/DecisionContext";
import { StewardFormat } from "@/presentation/format/StewardFormat";
import styles from "./Account.module.css";

/**
 * Two states that used to look the same and are not.
 *
 * "No recommendation was returned" is an absence: the platform has not queued
 * a decision for this account. "The platform decided no action" is a
 * `NO_ACTION` opportunity with evidence and a dossier: a decision that was
 * made and recorded. Rendering the first as if it were the second told an
 * operator the account had been assessed when it had not.
 *
 * Above the review buttons, one line says what state the context is in at
 * the moment of review: whether the linked evidence is fresh and whether its
 * sources are healthy. A confidence badge above stale evidence from a
 * degraded connector is the interface making an uncertain decision look more
 * certain than it is; this line is the correction. `DecisionContext` only
 * summarises fields already on this page.
 */
export function AccountDecisionPanel({
  opportunity,
  canReview,
  evidence,
  connectors,
  updatedAt,
}: {
  opportunity: CustomerOpportunity | null;
  canReview: boolean;
  evidence: EvidenceSignal[];
  connectors: ConnectorHealth[];
  updatedAt: string;
}) {
  if (!opportunity) {
    return (
      <section className={styles.decisionPanel}>
        <StatusBadge tone="neutral" dot>
          No open recommendation
        </StatusBadge>
        <h2>Nothing is queued for this account.</h2>
        <p>
          The platform has not returned a recommendation. That is the absence of
          a queued decision, not a decision that no action is needed. When the
          policy assesses an account and chooses inaction, that choice appears
          here with its evidence and dossier.
        </p>
      </section>
    );
  }

  const isNoAction = opportunity.kind === "NO_ACTION";
  const context = new DecisionContext(
    opportunity,
    evidence,
    connectors,
  ).summarize();

  return (
    <section className={styles.decisionPanel}>
      <div className={styles.decisionTopline}>
        <div className={styles.decisionBadges}>
          <StatusBadge tone={isNoAction ? "positive" : "violet"} dot>
            {opportunity.disposition}
          </StatusBadge>
          {isNoAction ? (
            <StatusBadge tone="neutral">Deliberate inaction</StatusBadge>
          ) : null}
        </div>
        <span>
          {StewardFormat.confidence(opportunity.confidence)} confidence
        </span>
      </div>
      <h2>{opportunity.title}</h2>
      <p>{opportunity.rationale}</p>
      {isNoAction ? (
        <p className={styles.policyNote}>
          The policy assessed this account and decided not to intervene. That is
          a recorded decision with evidence and a dossier, not the absence of
          one. Your review records agreement or disagreement; the platform
          decides what follows.
        </p>
      ) : null}
      <div className={styles.nextAction}>
        <strong>Recommended next action</strong>
        <span>{opportunity.recommendedAction}</span>
      </div>
      <div className={styles.dossierLine}>
        <FileKey2 size={15} aria-hidden="true" />
        {opportunity.dossierId ?? "Decision Dossier pending"}
      </div>
      <div
        className={styles.reviewContext}
        data-tone={context.tone}
        role="note"
        aria-label="Context at review"
      >
        <Radar size={14} aria-hidden="true" />
        <div>
          <strong>Context at review</strong>
          <span>
            {context.headline} Account evidence updated{" "}
            <RelativeTime value={updatedAt} />.
          </span>
        </div>
      </div>
      <ReviewAction
        opportunityId={opportunity.id}
        canReview={canReview}
        displayedDisposition={opportunity.disposition}
      />
    </section>
  );
}
