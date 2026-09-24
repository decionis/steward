import Link from "next/link";
import { ArrowRight, FileKey2 } from "lucide-react";
import { RelativeTime } from "@/components/common/RelativeTime";
import { ArbitrationNote } from "@/components/common/ArbitrationNote";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { CustomerOpportunity } from "@/domain/opportunities/CustomerOpportunity";
import { StewardFormat } from "@/presentation/format/StewardFormat";
import { ReviewAction } from "./ReviewAction";
import styles from "./Dashboard.module.css";

function dispositionTone(disposition: CustomerOpportunity["disposition"]) {
  if (disposition === "ALLOW") return "positive" as const;
  if (disposition === "BLOCK") return "critical" as const;
  if (disposition === "ESCALATE") return "warning" as const;
  return "violet" as const;
}

export interface OpportunityCardProps {
  opportunity: CustomerOpportunity;
  canReview: boolean;
}

export function OpportunityCard({
  opportunity,
  canReview,
}: OpportunityCardProps) {
  return (
    <article className={styles.opportunityCard}>
      <div className={styles.opportunityMain}>
        <div className={styles.opportunityMeta}>
          <StatusBadge tone={dispositionTone(opportunity.disposition)} dot>
            {opportunity.disposition}
          </StatusBadge>
          <span>{opportunity.kind.replaceAll("_", " ")}</span>
          <span>
            <RelativeTime value={opportunity.createdAt} />
          </span>
        </div>
        <h3>{opportunity.title}</h3>
        <Link
          href={`/accounts/${opportunity.accountId}`}
          className={styles.accountLink}
        >
          {opportunity.accountName}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <p>{opportunity.rationale}</p>
        <div className={styles.recommendation}>
          <strong>Recommended next action</strong>
          <span>{opportunity.recommendedAction}</span>
        </div>
        <ArbitrationNote arbitration={opportunity.arbitration} />
      </div>

      <aside
        className={styles.opportunityEvidence}
        aria-label="Decision evidence summary"
      >
        <div className={styles.metricPair}>
          <span>Confidence</span>
          <strong>{StewardFormat.confidence(opportunity.confidence)}</strong>
        </div>
        <div className={styles.metricPair}>
          <span>Evidence</span>
          <strong>{StewardFormat.percent(opportunity.evidenceCoverage)}</strong>
        </div>
        <div className={styles.progressTrack}>
          <span style={{ width: `${opportunity.evidenceCoverage}%` }} />
        </div>
        <div className={styles.dossier}>
          <FileKey2 size={15} aria-hidden="true" />
          {opportunity.dossierId ?? "Dossier pending"}
        </div>
        <ReviewAction
          opportunityId={opportunity.id}
          canReview={canReview}
          displayedDisposition={opportunity.disposition}
        />
      </aside>
    </article>
  );
}
