import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CircleHelp,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { StewardSession } from "@/domain/auth/StewardSession";
import { StatusBadge } from "@/components/common/StatusBadge";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  session: StewardSession;
  children: ReactNode;
}

export function AppShell({ session, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Decionis Steward home"
        >
          <span className={styles.brandMark}>D</span>
          <span>
            <strong>Decionis</strong>
            <small>Steward</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/" className={styles.navItem}>
            <Activity size={18} aria-hidden="true" />
            Control center
          </Link>
          <Link href="/#accounts" className={styles.navItem}>
            <Building2 size={18} aria-hidden="true" />
            Accounts
          </Link>
          <Link href="/#opportunities" className={styles.navItem}>
            <ShieldCheck size={18} aria-hidden="true" />
            Governed actions
          </Link>
        </nav>

        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.utility} disabled>
            <Settings2 size={17} aria-hidden="true" />
            Policy settings
          </button>
          <button type="button" className={styles.utility} disabled>
            <CircleHelp size={17} aria-hidden="true" />
            Help &amp; evidence guide
          </button>
          <div className={styles.identity}>
            <div className={styles.avatar}>{session.displayName.charAt(0)}</div>
            <div>
              <strong>{session.displayName}</strong>
              <small>{session.roles.join(" · ")}</small>
            </div>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.orgLabel}>Workspace</span>
            <strong>
              {session.mode === "DEMO"
                ? "Zulu Financial · Demo workspace"
                : session.orgId}
            </strong>
          </div>
          <div className={styles.topbarActions}>
            <StatusBadge
              tone={session.mode === "DEMO" ? "violet" : "positive"}
              dot
            >
              {session.mode === "DEMO" ? "Demo evidence" : "Live evidence"}
            </StatusBadge>
            {session.mode === "DEMO" ? (
              // The activation point, stated where an adopter meets it. The
              // sign-in page says what is free and what is paid, then hands
              // off to Decionis. Nothing here checks a plan or an entitlement.
              <Link href="/sign-in" className={styles.connect}>
                Connect your platform
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
