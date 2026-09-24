import type { AccountSummary } from "@/domain/accounts/CustomerAccount";

export type PlanDimension = "region" | "segment";

export interface SupportPlanGroup {
  key: string;
  accounts: number;
  friction: number;
  expansionReady: number;
  reviewsRequired: number;
  healthy: number;
  averageHealthScore: number;
  averageUtilization: number;
  names: string[];
}

export interface SupportPlanSummary {
  dimension: PlanDimension;
  groups: SupportPlanGroup[];
}

/**
 * Where support effort goes first. Groups the portfolio by region or by
 * segment and counts the state of each group from fields already on the
 * dashboard: accounts, active friction, expansion ready, reviews required,
 * healthy, average health and average utilisation.
 *
 * Groups are ordered by friction, then reviews required, then size, then
 * name, so the group that needs attention is at the top. That is an
 * ordering of what the platform already said about each account, not a
 * decision about any of them. Formatting policy only; see
 * docs/ProactiveSupport.md, P1.
 */
export class SupportPlan {
  constructor(private readonly accounts: readonly AccountSummary[]) {}

  by(dimension: PlanDimension): SupportPlanSummary {
    const buckets = new Map<string, AccountSummary[]>();
    for (const account of this.accounts) {
      const key =
        dimension === "region" ? account.primaryRegion : account.segment;
      buckets.set(key, [...(buckets.get(key) ?? []), account]);
    }

    const groups = [...buckets.entries()].map(
      ([key, members]): SupportPlanGroup => ({
        key,
        accounts: members.length,
        friction: members.filter((a) => a.state === "FRICTION").length,
        expansionReady: members.filter((a) => a.state === "EXPANSION_READY")
          .length,
        reviewsRequired: members.filter((a) => a.state === "REVIEW_REQUIRED")
          .length,
        healthy: members.filter((a) => a.state === "HEALTHY").length,
        averageHealthScore: SupportPlan.average(
          members.map((a) => a.healthScore),
        ),
        averageUtilization: SupportPlan.average(
          members.map((a) => a.limitUtilization),
        ),
        names: members.map((a) => a.name).sort((a, b) => a.localeCompare(b)),
      }),
    );

    groups.sort(
      (a, b) =>
        b.friction - a.friction ||
        b.reviewsRequired - a.reviewsRequired ||
        b.accounts - a.accounts ||
        a.key.localeCompare(b.key),
    );

    return { dimension, groups };
  }

  private static average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round(
      values.reduce((total, v) => total + v, 0) / values.length,
    );
  }
}
