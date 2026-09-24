import { Scale } from "lucide-react";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import type { Arbitration } from "@/domain/opportunities/CustomerOpportunity";
import styles from "./ArbitrationNote.module.css";

/**
 * "Why this disposition": the arbitration the platform's policy pack made,
 * rendered so an approver can disagree with it precisely. Which context
 * governed, what it rested on, what it overrode, what it suppressed, and
 * under which policy version.
 *
 * Steward renders this; it never computes it. With no `arbitration` on the
 * opportunity, nothing renders and the card looks as it did before. Given
 * the account's evidence, signals are named by title; without it (the queue
 * card has only the opportunity) they are counted.
 */
export function ArbitrationNote({
  arbitration,
  evidence,
}: {
  arbitration: Arbitration | undefined;
  evidence?: EvidenceSignal[];
}) {
  if (!arbitration) return null;

  const titles = new Map(
    (evidence ?? []).map((signal) => [signal.id, signal.title]),
  );
  const describe = (ids: string[]): string => {
    if (evidence) return ids.map((id) => titles.get(id) ?? id).join("; ");
    return `${ids.length} linked ${ids.length === 1 ? "signal" : "signals"}`;
  };

  return (
    <div className={styles.note} role="note" aria-label="Why this disposition">
      <div className={styles.heading}>
        <Scale size={13} aria-hidden="true" />
        <strong>Why this disposition</strong>
      </div>
      <p>{arbitration.summary}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Governing context</dt>
          <dd>
            <span className={styles.contextClass}>
              {arbitration.governingClass}
            </span>{" "}
            under <code>{arbitration.policyReference}</code>
          </dd>
        </div>
        <div>
          <dt>Rests on</dt>
          <dd>{describe(arbitration.governingEvidenceIds)}</dd>
        </div>
        {arbitration.overriddenEvidenceIds.length > 0 ? (
          <div>
            <dt>Overrides</dt>
            <dd>{describe(arbitration.overriddenEvidenceIds)}</dd>
          </div>
        ) : null}
        {arbitration.suppressedActions.length > 0 ? (
          <div>
            <dt>Suppressed</dt>
            <dd>{arbitration.suppressedActions.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
