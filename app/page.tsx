import { AccountPortfolioTable } from "@/components/dashboard/AccountPortfolioTable";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { OpportunityQueue } from "@/components/dashboard/OpportunityQueue";
import { PortfolioSummary } from "@/components/dashboard/PortfolioSummary";
import { ResolvedDecisions } from "@/components/dashboard/ResolvedDecisions";
import { SupportPlan } from "@/components/dashboard/SupportPlan";
import { AppShell } from "@/components/layout/AppShell";
import { StewardPermissions } from "@/domain/auth/StewardPermissions";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const context = await new StewardCompositionRoot().createServerContext();
  const portfolio = await context.dashboard.getPortfolio();
  const canReview = StewardPermissions.allows(context.session.roles, "review");
  const resolved = portfolio.opportunities.filter(
    (opportunity) => opportunity.status === "COMPLETED",
  );
  const open = portfolio.opportunities.filter(
    (opportunity) => opportunity.status !== "COMPLETED",
  );

  return (
    <AppShell session={context.session}>
      <DashboardHeader portfolio={portfolio} />
      <PortfolioSummary summary={portfolio.summary} />
      <OpportunityQueue opportunities={open} canReview={canReview} />
      <ResolvedDecisions opportunities={resolved} />
      <SupportPlan accounts={portfolio.accounts} />
      <AccountPortfolioTable accounts={portfolio.accounts} />
    </AppShell>
  );
}
