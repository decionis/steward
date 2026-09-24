import {
  ContextClassSchema,
  type ContextClass,
} from "@/domain/common/ContextClass";
import type { EvidenceSignal } from "@/domain/evidence/EvidenceSignal";

export type ClassCoverage = "CURRENT" | "AGING" | "ABSENT";

export interface ClassCoverageEntry {
  contextClass: ContextClass;
  /** CURRENT: a linked signal is LIVE or CURRENT. AGING: only AGING or STALE. ABSENT: none. */
  coverage: ClassCoverage;
  signalCount: number;
}

export interface ContextCoverageSummary {
  /**
   * False when nothing is linked or any linked signal lacks a class. The
   * strip must not render then: a partial strip would read as "these classes
   * are absent" when the truth is "the platform has not said".
   */
  classified: boolean;
  classes: ClassCoverageEntry[];
  covered: number;
  total: number;
}

/**
 * Which kinds of context sit behind a recommendation, and how fresh each is.
 * A scalar coverage percentage cannot say that no operational signal at all
 * backs an expansion; this can.
 *
 * Formatting policy only: it groups fields the platform supplied. It never
 * infers a class, and it has no opinion on whether the coverage is enough.
 * See docs/ContextEngineering.md, W5.
 */
export class ContextCoverage {
  constructor(
    private readonly linkedEvidenceIds: readonly string[],
    private readonly evidence: readonly EvidenceSignal[],
  ) {}

  summarize(): ContextCoverageSummary {
    const ids = new Set(this.linkedEvidenceIds);
    const linked = this.evidence.filter((signal) => ids.has(signal.id));
    const classified =
      linked.length > 0 &&
      linked.every((signal) => signal.contextClass !== undefined);

    const classes = ContextClassSchema.options.map(
      (contextClass): ClassCoverageEntry => {
        const ofClass = linked.filter(
          (signal) => signal.contextClass === contextClass,
        );
        const coverage: ClassCoverage = ofClass.some(
          (signal) =>
            signal.freshness === "LIVE" || signal.freshness === "CURRENT",
        )
          ? "CURRENT"
          : ofClass.length > 0
            ? "AGING"
            : "ABSENT";
        return { contextClass, coverage, signalCount: ofClass.length };
      },
    );

    return {
      classified,
      classes,
      covered: classes.filter((entry) => entry.coverage === "CURRENT").length,
      total: classes.length,
    };
  }
}
