import { z } from "zod";
import {
  OpenObjectSchema,
  ProtocolIdSchema,
  ProtocolTimestampSchema,
  Sha256DigestSchema,
} from "./ProtocolPrimitives";

/**
 * `POST /v1/protocol/signals/envelopes` (ingestProtocolSignalEnvelope): one
 * versioned signal, admitted for deterministic policy use and answered with
 * an artifact id. Decision D2 in docs/ProtocolContracts.md makes this where a
 * collected signal goes; the mapping from `CapturedSignal` is workstream C2.
 */
export const SignalEnvelopeSourceModeSchema = z.enum([
  "DIRECT_API",
  "CUSTOMER_INFRA",
  "WEBHOOK",
  "MANUAL",
]);

export const SemanticSignalMetadataSchema = z.object({
  schema_version: z.literal("1.0"),
  signal_id: z.string().min(1),
  kind: z
    .string()
    .regex(
      /^(intent_risk|scope_drift|data_sensitivity|suspected_exfiltration|[a-z0-9][a-z0-9.-]{0,62}:[a-z0-9][a-z0-9._-]{0,119})$/,
      "a built-in kind or a namespaced one such as steward:support",
    ),
  detector_version: z.string().min(1),
  observed_at: ProtocolTimestampSchema,
  confidence_basis_points: z.number().int().min(0).max(10_000),
  evidence_digest: Sha256DigestSchema.nullable(),
  value_digest: Sha256DigestSchema,
  material: z.boolean(),
});

export const SignalEnvelopeSchema = z.object({
  protocol_version: z.string().regex(/^1\.[0-9]+(\.[0-9]+)?$/),
  envelope_id: ProtocolIdSchema,
  org_id: z.string().min(1),
  source: z.object({
    provider: z.string().min(1),
    connector_id: z.string().min(1).optional(),
    mode: SignalEnvelopeSourceModeSchema,
  }),
  domain: z.string().min(1),
  metric_name: z.string().min(1),
  metric_type: z.enum(["gauge", "counter", "event", "categorical"]),
  value: z.unknown(),
  unit: z.string().min(1).optional(),
  recorded_at: ProtocolTimestampSchema,
  ingested_at: ProtocolTimestampSchema,
  dimensions: OpenObjectSchema.optional(),
  semantic: SemanticSignalMetadataSchema.optional(),
  evidence: z.array(z.string()).optional(),
  trace: OpenObjectSchema.optional(),
  hash: z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .optional(),
});

/** 202 for a signal envelope or a policy bundle. */
export const ArtifactAcceptedResponseSchema = z.object({
  accepted: z.boolean(),
  service: z.string().min(1),
  protocol_version: z.string().min(1),
  artifact: z.enum(["policy_bundle", "signal_envelope"]),
  artifact_id: z.string().min(1),
  org_id: z.string().min(1),
  received_at: ProtocolTimestampSchema,
});

export type SignalEnvelope = z.infer<typeof SignalEnvelopeSchema>;
export type ArtifactAcceptedResponse = z.infer<
  typeof ArtifactAcceptedResponseSchema
>;
