import Link from "next/link";
import { ArrowRight, FileKey2 } from "lucide-react";
import { RelativeTime } from "@/components/common/RelativeTime";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";
import dashboard from "./Dashboard.module.css";
import styles from "./ResolvedDecisions.module.css";

/**
 * Decisions that reached an outcome. The queue answers "what needs a
 * decision now"; nothing answered "what did the last decision produce".
 * Read-only: a completed decision is history, attributable through its
 * dossier, and carries no review controls.
 */
export function ResolvedDecisions({
  opportunities,
}: {
  opportunities: CustomerOpportunity[];
}) {
  if (opportunities.length === 0) return null;

  const count = opportunities.length;

  return (
    <section
      id="resolved"
      className={dashboard.section}
      aria-labelledby="resolved-heading"
    >
      <div className={dashboard.sectionHeading}>
        <div>
          <span>Closed loop</span>
          <h2 id="resolved-heading">Recently resolved</h2>
        </div>
        <p>
          {count} {count === 1 ? "decision" : "decisions"} that reached an
          outcome, with dossier references
        </p>
      </div>
      <ul className={styles.list}>
        {opportunities.map((opportunity) => (
          <li key={opportunity.id} className={styles.item}>
            <div>
              <div className={styles.meta}>
                <StatusBadge tone="positive" dot>
                  {opportunity.status}
                </StatusBadge>
                <span>{opportunity.kind.replaceAll("_", " ")}</span>
                <span>
                  <RelativeTime value={opportunity.createdAt} />
                </span>
              </div>
              <strong>{opportunity.title}</strong>
              <Link href={`/accounts/${opportunity.accountId}`}>
                {opportunity.accountName}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
              <p>{opportunity.recommendedAction}</p>
            </div>
            <div className={styles.dossier}>
              <FileKey2 size={14} aria-hidden="true" />
              {opportunity.dossierId ?? "Dossier pending"}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
