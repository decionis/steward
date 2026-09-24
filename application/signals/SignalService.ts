import type { StewardSession } from "@/domain/auth/StewardSession";
import type {
  SignalBatch,
  SignalForwardResult,
} from "@/domain/signals/CapturedSignal";
import type { SignalSource } from "@/domain/signals/SignalSource";
import type { SignalConnectorRegistry } from "@/infra/connectors/SignalConnectorRegistry";
import {
  StewardForbiddenError,
  StewardUnavailableError,
} from "@/infra/errors/StewardErrors";
import type { SignalRepository } from "@/infra/repositories/SignalRepository";

export interface SignalCollection {
  batch: SignalBatch;
  result: SignalForwardResult;
}

/**
 * Collect from a source and forward the batch. Collection reaches a system
 * the operator connected, so it is gated to OPERATOR and above; VIEWER can see
 * the sources and their health but cannot pull from them. As with reviews,
 * the gate here is a UX affordance and the platform re-authorises what it
 * receives.
 */
export class SignalService {
  constructor(
    private readonly registry: SignalConnectorRegistry,
    private readonly repository: SignalRepository,
    private readonly session: StewardSession,
  ) {}

  listSources(): SignalSource[] {
    return this.registry.list();
  }

  async collect(sourceId: string): Promise<SignalCollection> {
    if (!this.session.roles.some((role) => role !== "VIEWER")) {
      throw new StewardForbiddenError(
        "Collecting signals needs the OPERATOR role or above",
      );
    }
    const connector = this.registry.require(sourceId);
    if (!connector.source.enabled) {
      throw new StewardUnavailableError(
        `${connector.source.name} is not configured on this deployment`,
      );
    }
    const signals = await connector.collect();
    const batch: SignalBatch = {
      batchId: crypto.randomUUID(),
      sourceId,
      collectedAt: new Date().toISOString(),
      signals,
    };
    const result = await this.repository.forward(batch);
    return { batch, result };
  }
}
