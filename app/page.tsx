import { AccountPortfolioTable } from "@/components/dashboard/AccountPortfolioTable";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { OpportunityQueue } from "@/components/dashboard/OpportunityQueue";
import { PortfolioSummary } from "@/components/dashboard/PortfolioSummary";
import { ResolvedDecisions } from "@/components/dashboard/ResolvedDecisions";
import { AppShell } from "@/components/layout/AppShell";
import { StewardCompositionRoot } from "@/infra/composition/StewardCompositionRoot";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const context = await new StewardCompositionRoot().createServerContext();
  const portfolio = await context.dashboard.getPortfolio();
  const canReview = context.session.roles.some(
    (role) => role === "APPROVER" || role === "ADMIN",
  );
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
      <AccountPortfolioTable accounts={portfolio.accounts} />
    </AppShell>
  );
}
