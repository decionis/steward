import { Database, Link2 } from "lucide-react";
import { RelativeTime } from "@/components/common/RelativeTime";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StewardFormat } from "@/presentation/format/StewardFormat";
import { ContextCoverageStrip } from "./ContextCoverageStrip";
import styles from "./Account.module.css";

function impactTone(impact: EvidenceSignal["impact"]) {
  if (impact === "POSITIVE") return "positive" as const;
  if (impact === "NEGATIVE") return "critical" as const;
  return "neutral" as const;
}

export function AccountEvidence({
  evidence,
  linkedEvidenceIds,
}: {
  evidence: EvidenceSignal[];
  /** The open recommendation's evidence ids, when there is one. */
  linkedEvidenceIds?: readonly string[];
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <span>Correlated evidence</span>
          <h2>What Steward considered</h2>
        </div>
        <Database size={18} aria-hidden="true" />
      </div>
      {linkedEvidenceIds ? (
        <ContextCoverageStrip
          linkedEvidenceIds={linkedEvidenceIds}
          evidence={evidence}
        />
      ) : null}
      <div className={styles.evidenceList}>
        {evidence.map((signal) => (
          <article key={signal.id} className={styles.evidenceItem}>
            <div className={styles.evidenceTopline}>
              <div className={styles.evidenceBadges}>
                <StatusBadge tone={impactTone(signal.impact)}>
                  {signal.category}
                </StatusBadge>
                {signal.contextClass ? (
                  <StatusBadge tone="info">{signal.contextClass}</StatusBadge>
                ) : null}
              </div>
              <span>
                <RelativeTime value={signal.observedAt} />
              </span>
            </div>
            <h3>{signal.title}</h3>
            <p>{signal.detail}</p>
            <div className={styles.provenance}>
              <Link2 size={13} aria-hidden="true" />
              {signal.source} · {signal.sourceRecordId} ·{" "}
              {StewardFormat.confidence(signal.confidence)} confidence
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
