import { Map as MapIcon } from "lucide-react";
import type { AccountSummary } from "@/domain/accounts/CustomerAccount";
import {
  SupportPlan as SupportPlanModel,
  type PlanDimension,
  type SupportPlanSummary,
} from "@/presentation/planning/SupportPlan";
import { StewardFormat } from "@/presentation/format/StewardFormat";
import styles from "./Dashboard.module.css";

const TITLES: Record<PlanDimension, string> = {
  region: "By region",
  segment: "By segment",
};

function PlanTable({ plan }: { plan: SupportPlanSummary }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={TITLES[plan.dimension]}>
        <thead>
          <tr>
            <th>{TITLES[plan.dimension]}</th>
            <th>Accounts</th>
            <th>Friction</th>
            <th>Expansion ready</th>
            <th>Reviews required</th>
            <th>Health</th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          {plan.groups.map((group) => (
            <tr key={group.key}>
              <td>
                <strong>{group.key}</strong>
                <small>{group.names.join(" · ")}</small>
              </td>
              <td>{group.accounts}</td>
              <td>{group.friction}</td>
              <td>{group.expansionReady}</td>
              <td>{group.reviewsRequired}</td>
              <td>{group.averageHealthScore}/100</td>
              <td>{StewardFormat.percent(group.averageUtilization)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Where support effort goes first. Two views of the same portfolio, by
 * region and by segment, ordered by active friction, then reviews required,
 * then size. Counts of what the platform already said about each account;
 * nothing here decides anything.
 */
export function SupportPlan({ accounts }: { accounts: AccountSummary[] }) {
  const model = new SupportPlanModel(accounts);
  return (
    <section
      id="plan"
      className={styles.section}
      aria-labelledby="plan-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span>Plan support</span>
          <h2 id="plan-heading">Where effort goes first</h2>
        </div>
        <p>
          <MapIcon size={14} aria-hidden="true" /> Ordered by active friction,
          then reviews required
        </p>
      </div>
      <div className={styles.planGrid}>
        <PlanTable plan={model.by("region")} />
        <PlanTable plan={model.by("segment")} />
      </div>
    </section>
  );
}
