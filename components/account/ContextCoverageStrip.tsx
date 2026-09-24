import { LayoutGrid } from "lucide-react";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";
import {
  ContextCoverage,
  type ClassCoverageEntry,
} from "@/presentation/context/ContextCoverage";
import styles from "./ContextCoverageStrip.module.css";

function describe(entry: ClassCoverageEntry): string {
  const noun = entry.signalCount === 1 ? "signal" : "signals";
  if (entry.coverage === "CURRENT")
    return `${entry.signalCount} linked ${noun}, live or current`;
  if (entry.coverage === "AGING")
    return `${entry.signalCount} linked ${noun}, aging or stale`;
  return "no linked signal";
}

/**
 * Which of the five context classes sit behind the open recommendation, and
 * how fresh each is. Renders only when every linked signal carries a class;
 * otherwise the scalar coverage elsewhere on the page stands alone, unchanged.
 */
export function ContextCoverageStrip({
  linkedEvidenceIds,
  evidence,
}: {
  linkedEvidenceIds: readonly string[];
  evidence: readonly EvidenceSignal[];
}) {
  const summary = new ContextCoverage(linkedEvidenceIds, evidence).summarize();
  if (!summary.classified) return null;

  return (
    <div className={styles.strip} role="group" aria-label="Context coverage">
      <div className={styles.label}>
        <LayoutGrid size={13} aria-hidden="true" />
        <span>Context behind the open recommendation</span>
        <strong>
          {summary.covered} of {summary.total} classes current
        </strong>
      </div>
      <ul className={styles.classes}>
        {summary.classes.map((entry) => (
          <li
            key={entry.contextClass}
            data-coverage={entry.coverage}
            title={describe(entry)}
          >
            <span className={styles.marker} aria-hidden="true" />
            {entry.contextClass}
            <span className={styles.visuallyHidden}>: {describe(entry)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
