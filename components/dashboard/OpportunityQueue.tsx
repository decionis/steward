import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";
import { StewardFormat } from "@/presentation/format/StewardFormat";
import { OpportunityCard } from "./OpportunityCard";
import styles from "./Dashboard.module.css";

/**
 * Inaction is a decision. A `NO_ACTION` recommendation and a review that was
 * `HELD` are both the platform choosing not to act, with evidence and a
 * dossier behind the choice. They are grouped beneath the queue rather than
 * inside it so that "what needs a decision now" stays a list of things that
 * need a decision now, and so that deliberate inaction is visible rather than
 * silently absent.
 *
 * This is grouping, not derivation: nothing here infers a disposition or a
 * suppressed action from the kind. That structure comes from the platform.
 */
function isDeliberateInaction(opportunity: CustomerOpportunity): boolean {
  return opportunity.kind === "NO_ACTION" || opportunity.status === "HELD";
}

export function OpportunityQueue({
  opportunities,
  canReview,
}: {
  opportunities: CustomerOpportunity[];
  canReview: boolean;
}) {
  const pending = opportunities.filter(
    (opportunity) => !isDeliberateInaction(opportunity),
  );
  const inaction = opportunities.filter(isDeliberateInaction);

  return (
    <>
      <section
        id="opportunities"
        className={styles.section}
        aria-labelledby="opportunities-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span>Governed action queue</span>
            <h2 id="opportunities-heading">What needs a decision now</h2>
          </div>
          <p>
            {StewardFormat.count(
              pending.length,
              "evidence-backed recommendation",
            )}
          </p>
        </div>

        {pending.length > 0 ? (
          <div className={styles.opportunityList}>
            {pending.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                canReview={canReview}
              />
            ))}
          </div>
        ) : (
          <p className={styles.reviewNotice}>
            Nothing is waiting for a decision.
          </p>
        )}
      </section>

      {inaction.length > 0 ? (
        <section
          id="inaction"
          className={styles.section}
          aria-labelledby="inaction-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <span>Deliberate inaction</span>
              <h2 id="inaction-heading">Decided: no action, or held</h2>
            </div>
            <p>
              {StewardFormat.count(inaction.length, "decision")} to suppress or
              defer action, backed by evidence and a dossier
            </p>
          </div>
          <div className={styles.opportunityList}>
            {inaction.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                canReview={canReview}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
