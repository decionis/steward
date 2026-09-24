import type { CapturedSignal } from "@/domain/signals/CapturedSignal";
import type { SignalSource } from "@/domain/signals/SignalSource";

/**
 * One configured signal source. `collect` reaches the source, in the
 * operator's trust domain, and returns the minimum viable payload; it never
 * reaches any host but the one the source names, and it never stores what it
 * collected. See docs/SignalConnectors.md.
 */
export interface SignalConnector {
  readonly source: SignalSource;
  collect(): Promise<CapturedSignal[]>;
}
