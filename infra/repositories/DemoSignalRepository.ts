import {
  SignalForwardResultSchema,
  type SignalBatch,
  type SignalForwardResult,
} from "@/domain/signals/CapturedSignal";
import type { SignalRepository } from "./SignalRepository";

/** Accepts every signal, records nothing, leaves the process nowhere. */
export class DemoSignalRepository implements SignalRepository {
  async forward(batch: SignalBatch): Promise<SignalForwardResult> {
    return SignalForwardResultSchema.parse({
      batchId: batch.batchId,
      accepted: batch.signals.length,
      rejected: [],
      receivedAt: new Date().toISOString(),
    });
  }
}
