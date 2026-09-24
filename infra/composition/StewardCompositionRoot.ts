import type { NextRequest } from "next/server";
import { AccountService } from "@/application/accounts/AccountService";
import { DashboardService } from "@/application/dashboard/DashboardService";
import { OpportunityService } from "@/application/opportunities/OpportunityService";
import { SignalService } from "@/application/signals/SignalService";
import { DecionisSignalIngressClient } from "@/infra/api/DecionisSignalIngressClient";
import { SignalConnectorFactory } from "@/infra/connectors/SignalConnectorFactory";
import { DecionisSignalRepository } from "@/infra/repositories/DecionisSignalRepository";
import { DemoSignalRepository } from "@/infra/repositories/DemoSignalRepository";
import type { SignalRepository } from "@/infra/repositories/SignalRepository";
import type { StewardSession } from "@/domain/auth/StewardSession";
import { StewardSessionResolver } from "@/infra/auth/StewardSessionResolver";
import { StewardRuntimeConfig } from "@/infra/config/StewardRuntimeConfig";
import { StewardRepositoryFactory } from "@/infra/repositories/StewardRepositoryFactory";
import type { StewardApplicationContext } from "./StewardApplicationContext";

export class StewardCompositionRoot {
  private readonly sessionResolver: StewardSessionResolver;
  private readonly repositoryFactory: StewardRepositoryFactory;
  private readonly connectorFactory: SignalConnectorFactory;
  private readonly signalRepository: SignalRepository;

  constructor(config = StewardRuntimeConfig.fromEnvironment()) {
    this.sessionResolver = new StewardSessionResolver(config);
    this.repositoryFactory = new StewardRepositoryFactory(config);
    this.connectorFactory = new SignalConnectorFactory(config);
    this.signalRepository =
      config.dataMode === "demo"
        ? new DemoSignalRepository()
        : new DecionisSignalRepository(
            config.signalIngress
              ? new DecionisSignalIngressClient({
                  ...config.signalIngress,
                  timeoutMs: config.timeoutMs,
                })
              : null,
          );
  }

  async createServerContext(): Promise<StewardApplicationContext> {
    const session = await this.sessionResolver.resolveServerSession();
    return this.createContext(session);
  }

  createRequestContext(request: NextRequest): StewardApplicationContext {
    const session = this.sessionResolver.resolveRequestSession(request);
    return this.createContext(session);
  }

  private createContext(session: StewardSession): StewardApplicationContext {
    const repository = this.repositoryFactory.create(session);
    return {
      session,
      dashboard: new DashboardService(repository),
      accounts: new AccountService(repository),
      opportunities: new OpportunityService(repository, session),
      signals: new SignalService(
        this.connectorFactory.create(),
        this.signalRepository,
        session,
      ),
    };
  }
}
