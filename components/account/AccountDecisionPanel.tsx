import { FileKey2 } from "lucide-react";
import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StewardFormat } from "@/presentation/format/StewardFormat";
import { ReviewAction } from "@/components/dashboard/ReviewAction";
import styles from "./Account.module.css";

/**
 * Two states that used to look the same and are not.
 *
 * "No recommendation was returned" is an absence: the platform has not queued
 * a decision for this account. "The platform decided no action" is a
 * `NO_ACTION` opportunity with evidence and a dossier: a decision that was
 * made and recorded. Rendering the first as if it were the second told an
 * operator the account had been assessed when it had not.
 */
export function AccountDecisionPanel({
  opportunity,
  canReview,
}: {
  opportunity: CustomerOpportunity | null;
  canReview: boolean;
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
      <ReviewAction opportunityId={opportunity.id} canReview={canReview} />
    </section>
  );
}
