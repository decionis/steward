import { ShieldCheck, Sparkles } from "lucide-react";
import { RelativeTime } from "@/components/common/RelativeTime";
import type { PortfolioSnapshot } from "@/domain/portfolio/PortfolioSnapshot";
import styles from "./Dashboard.module.css";

export function DashboardHeader({
  portfolio,
}: {
  portfolio: PortfolioSnapshot;
}) {
  return (
    <header className={styles.header}>
      <div>
        <div className={styles.kicker}>
          <ShieldCheck size={15} aria-hidden="true" />
          Governed customer operations
        </div>
        <h1>Control center</h1>
        <p>
          Limit reviews, expansion, friction and KYC escalations in one queue,
          with the evidence behind each. Reviews are recorded here and executed
          by Decionis.
        </p>
      </div>
      <div className={styles.evidenceNote}>
        <Sparkles size={18} aria-hidden="true" />
        <div>
          <strong>Evidence adapts. Authority stays deterministic.</strong>
          <span>
            Snapshot refreshed <RelativeTime value={portfolio.generatedAt} />
          </span>
        </div>
      </div>
    </header>
  );
}
