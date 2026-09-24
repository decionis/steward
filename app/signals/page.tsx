import { Cable } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SourceTable } from "@/components/signals/SourceTable";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";
import styles from "@/components/signals/Signals.module.css";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const context = await new StewardCompositionRoot().createServerContext();
  const sources = context.signals.listSources();
  const canCollect = context.session.roles.some((role) => role !== "VIEWER");

  return (
    <AppShell session={context.session}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>
            <Cable size={15} aria-hidden="true" />
            Signal sources
          </div>
          <h1>What Steward collects from</h1>
          <p>
            The systems this deployment is connected to, their health, and when
            each was last collected. Collecting pulls the latest signals and
            forwards them upstream over the Decionis Protocol, where they are
            resolved to accounts and weighed. Nothing collected is stored here.
          </p>
        </div>
      </header>
      <SourceTable sources={sources} canCollect={canCollect} />
      <p className={styles.boundary}>
        Credentials for these sources are mounted on the server and never reach
        the browser. Steward collects and forwards; the platform decides.
      </p>
    </AppShell>
  );
}
