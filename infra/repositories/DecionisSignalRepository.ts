import {
  SignalForwardResultSchema,
  type SignalBatch,
  type SignalForwardResult,
} from "@/domain/signals/CapturedSignal";
import type { DecionisSignalIngressClient } from "@/infra/api/DecionisSignalIngressClient";
import { toIngressRequest } from "@/infra/api/SignalIngressMapper";
import { StewardUnavailableError } from "@/infra/errors/StewardErrors";
import type { SignalRepository } from "./SignalRepository";

/**
 * Forwards a batch over the Decionis Protocol's published signal ingress.
 * Steward is a third-party application built on the Protocol, so it speaks
 * the operation the Protocol publishes rather than asking for its own. The
 * ingress acknowledges per batch: a 2xx accepts every event it carried. An
 * unconfigured deployment says so, with a 503, rather than pretending.
 */
export class DecionisSignalRepository implements SignalRepository {
  constructor(private readonly client: DecionisSignalIngressClient | null) {}

  async forward(batch: SignalBatch): Promise<SignalForwardResult> {
    if (!this.client) {
      throw new StewardUnavailableError(
        "Signal forwarding is not configured on this deployment: set DECIONIS_CONNECTOR_ID and DECIONIS_WEBHOOK_SECRET from the Decionis deployment bundle",
      );
    }
    if (batch.signals.length > 0) {
      await this.client.send(toIngressRequest(batch));
    }
    return SignalForwardResultSchema.parse({
      batchId: batch.batchId,
      accepted: batch.signals.length,
      rejected: [],
      receivedAt: new Date().toISOString(),
    });
  }
}
