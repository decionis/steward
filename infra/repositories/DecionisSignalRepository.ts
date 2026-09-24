import type {
  SignalBatch,
  SignalForwardResult,
} from "@/domain/signals/CapturedSignal";
import { StewardUnavailableError } from "@/infra/errors/StewardErrors";
import type { SignalRepository } from "./SignalRepository";

/**
 * The Decionis Protocol client for signal ingestion. The Protocol does not
 * yet publish the operation (docs/SignalConnectors.md, "Protocol request"),
 * so live mode says so, with a 503, rather than pretending a batch was
 * accepted. When the operation is published, this class gains the call and a
 * Zod schema for its response, like every other operation.
 */
export class DecionisSignalRepository implements SignalRepository {
  async forward(batch: SignalBatch): Promise<SignalForwardResult> {
    throw new StewardUnavailableError(
      `The Decionis Protocol does not yet publish a signal ingestion operation; batch ${batch.batchId} was not forwarded and is not stored.`,
    );
  }
}
