import { notFound } from "next/navigation";
import { AccountConnections } from "@/components/account/AccountConnections";
import { AccountDecisionPanel } from "@/components/account/AccountDecisionPanel";
import { AccountEvidence } from "@/components/account/AccountEvidence";
import { AccountHeader } from "@/components/account/AccountHeader";
import { AccountPolicy } from "@/components/account/AccountPolicy";
import { AccountTimeline } from "@/components/account/AccountTimeline";
import { AppShell } from "@/components/layout/AppShell";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";
import { StewardNotFoundError } from "@/infra/errors/StewardErrors";
import styles from "@/components/account/Account.module.css";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: accountId } = await params;
  const context = await new StewardCompositionRoot().createServerContext();

  try {
    const [account, opportunities] = await Promise.all([
      context.accounts.requireAccount(accountId),
      context.opportunities.list(),
    ]);
    // The open recommendation, not the first one: a completed decision on
    // the same account is history, and belongs on the timeline.
    const opportunity =
      opportunities.find(
        (candidate) =>
          candidate.accountId === account.id &&
          candidate.status !== "COMPLETED",
      ) ?? null;
    const canReview = context.session.roles.some(
      (role) => role === "APPROVER" || role === "ADMIN",
    );

    return (
      <AppShell session={context.session}>
        <AccountHeader account={account} />
        <AccountDecisionPanel
          opportunity={opportunity}
          canReview={canReview}
          evidence={account.evidence}
          connectors={account.connectors}
          updatedAt={account.updatedAt}
        />
        <div className={styles.contentGrid}>
          <AccountEvidence
            evidence={account.evidence}
            linkedEvidenceIds={opportunity?.evidenceIds}
          />
          <div className={styles.sideStack}>
            <AccountConnections connectors={account.connectors} />
            <AccountPolicy policy={account.policyEnvelope} />
            <AccountTimeline events={account.timeline} />
          </div>
        </div>
      </AppShell>
    );
  } catch (error) {
    if (error instanceof StewardNotFoundError) notFound();
    throw error;
  }
}
