import type { StewardRuntimeConfig } from "@/infra/config/StewardRuntimeConfig";
import { DemoSignalConnector } from "./DemoSignalConnector";
import { SignalConnectorRegistry } from "./SignalConnectorRegistry";

/**
 * Demo mode: the fixture sources. Live mode: the connectors an operator
 * configured. Until the first live connector lands (document intake, S2), a
 * live registry is empty and the Sources page says so; there is no fixture
 * fallback in live mode here any more than anywhere else.
 */
export class SignalConnectorFactory {
  constructor(private readonly config: StewardRuntimeConfig) {}

  create(): SignalConnectorRegistry {
    if (this.config.dataMode === "demo") {
      return new SignalConnectorRegistry(DemoSignalConnector.all());
    }
    return new SignalConnectorRegistry([]);
  }
}
