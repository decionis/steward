import type {
  SignalBatch,
  SignalForwardResult,
} from "@/domain/signals/CapturedSignal";

/** Forwards a collected batch upstream. Demo accepts in-process; live speaks the Decionis Protocol. */
export interface SignalRepository {
  forward(batch: SignalBatch): Promise<SignalForwardResult>;
}
