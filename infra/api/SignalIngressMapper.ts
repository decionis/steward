import type {
  CapturedSignal,
  SignalBatch,
} from "@/domain/signals/CapturedSignal";
import {
  IngressRequestSchema,
  type IngressEvent,
  type IngressRequest,
} from "@/domain/signals/SignalIngress";

/**
 * A `CapturedSignal` as an ingress event. The data keys follow the mapping
 * vocabulary the Protocol's signal-mapping session infers from a sample
 * (timestamp, outcome, channel, risk score, identifier), so an operator
 * confirming the mapping recognises each field; the rest is provenance.
 * `signal_id` and `batch_id` are the idempotent identifiers the ingress
 * asks for, so a replay after an uncertain delivery is safe.
 */
export function toIngressEvent(
  signal: CapturedSignal,
  batch: Pick<SignalBatch, "batchId" | "collectedAt">,
): IngressEvent {
  return {
    type: `signal.${signal.category.toLowerCase()}`,
    timestamp: signal.observedAt,
    data: {
      signal_id: signal.id,
      batch_id: batch.batchId,
      source: signal.sourceId,
      source_record: signal.sourceRecordId,
      identifier: signal.accountReference,
      channel: signal.category,
      outcome: signal.title,
      detail: signal.detail,
      risk_score: signal.confidence,
      ...(signal.contextClass ? { context_class: signal.contextClass } : {}),
      observed_at: signal.observedAt,
      captured_at: signal.capturedAt,
      collected_at: batch.collectedAt,
    },
  };
}

export function toIngressRequest(batch: SignalBatch): IngressRequest {
  return IngressRequestSchema.parse({
    events: batch.signals.map((signal) => toIngressEvent(signal, batch)),
  });
}
