import type { NextRequest } from "next/server";
import { AccountService } from "@/application/accounts/AccountService";
import type { IdentityStore } from "@/application/auth/IdentityStore";
import { OidcSignInService } from "@/application/auth/OidcSignInService";
import { DashboardService } from "@/application/dashboard/DashboardService";
import { OpportunityService } from "@/application/opportunities/OpportunityService";
import { SignalService } from "@/application/signals/SignalService";
import { DecionisSignalIngressClient } from "@/infra/api/DecionisSignalIngressClient";
import { OidcClient } from "@/infra/auth/oidc/OidcClient";
import { SignalConnectorFactory } from "@/infra/connectors/SignalConnectorFactory";
import { DecionisSignalRepository } from "@/infra/repositories/DecionisSignalRepository";
import { DemoSignalRepository } from "@/infra/repositories/DemoSignalRepository";
import type { SignalRepository } from "@/infra/repositories/SignalRepository";
import type { StewardSession } from "@/domain/auth/StewardSession";
import {
  StewardSessionResolver,
  type IdentityStoreProvider,
} from "@/infra/auth/StewardSessionResolver";
import { StewardRuntimeConfig } from "@/infra/config/StewardRuntimeConfig";
import { Persistence } from "@/infra/persistence/Persistence";
import { TypeOrmIdentityStore } from "@/infra/persistence/TypeOrmIdentityStore";
import { StewardRepositoryFactory } from "@/infra/repositories/StewardRepositoryFactory";
import type { StewardApplicationContext } from "./StewardApplicationContext";

/** A Steward session lives ten hours at most: the realm's SSO maximum. */
export const SESSION_LIFETIME_MS = 10 * 60 * 60 * 1000;

export class StewardCompositionRoot {
  readonly config: StewardRuntimeConfig;
  private readonly identityStore: IdentityStoreProvider | null;
  private readonly sessionResolver: StewardSessionResolver;
  private readonly repositoryFactory: StewardRepositoryFactory;
  private readonly connectorFactory: SignalConnectorFactory;
  private readonly signalRepository: SignalRepository;

  constructor(
    config = StewardRuntimeConfig.fromEnvironment(),
    identityStore?: IdentityStoreProvider,
  ) {
    this.config = config;
    this.identityStore =
      identityStore ??
      (config.persistence
        ? StewardCompositionRoot.databaseIdentityStore(config)
        : null);
    this.sessionResolver = new StewardSessionResolver(
      config,
      this.identityStore,
    );
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

  async createRequestContext(
    request: NextRequest,
  ): Promise<StewardApplicationContext> {
    const session = await this.sessionResolver.resolveRequestSession(request);
    return this.createContext(session);
  }

  /**
   * Who is asking, and nothing else: no repository, so a session that cannot
   * yet read the platform (a kloakware session with no server credential,
   * until the screens move onto the Protocol client) is still a session.
   */
  resolveRequestSession(request: NextRequest): Promise<StewardSession> {
    return this.sessionResolver.resolveRequestSession(request);
  }

  /**
   * The sign-in through kloakware, or null when this deployment has no
   * issuer configured or no database to keep sessions in.
   */
  async createSignInService(): Promise<OidcSignInService | null> {
    const oidc = this.config.oidc;
    const orgId = this.config.decionisWorkspace?.orgId;
    if (!oidc || !orgId || !this.identityStore) return null;
    return new OidcSignInService(
      new OidcClient(oidc),
      await this.identityStore(),
      {
        orgId,
        sessionLifetimeMs: SESSION_LIFETIME_MS,
      },
    );
  }

  /** The identity store, for a route that writes a record without a session; null when this process has no database. */
  async identityStoreOrNull(): Promise<IdentityStore | null> {
    return this.identityStore ? this.identityStore() : null;
  }

  /** Steward's origin as the browser and the issuer see it: configured, or the request's own. */
  publicOrigin(request: NextRequest): string {
    return this.config.oidc?.publicUrl ?? request.nextUrl.origin;
  }

  private static databaseIdentityStore(
    config: StewardRuntimeConfig,
  ): IdentityStoreProvider {
    let store: Promise<IdentityStore> | null = null;
    return () => {
      store ??= Persistence.open(config.persistence!).then(
        (dataSource) => new TypeOrmIdentityStore(dataSource),
      );
      return store;
    };
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
