import type { SignalSource } from "@/domain/signals/SignalSource";
import { StewardNotFoundError } from "@/infra/errors/StewardErrors";
import type { SignalConnector } from "./SignalConnector";

/** The configured connectors, by id. Built once per request by the factory. */
export class SignalConnectorRegistry {
  private readonly byId: Map<string, SignalConnector>;

  constructor(connectors: readonly SignalConnector[]) {
    this.byId = new Map(connectors.map((c) => [c.source.id, c]));
  }

  list(): SignalSource[] {
    return [...this.byId.values()].map((c) => c.source);
  }

  require(sourceId: string): SignalConnector {
    const connector = this.byId.get(sourceId);
    if (!connector) throw new StewardNotFoundError("Signal source");
    return connector;
  }
}
