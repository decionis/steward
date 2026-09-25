import { z } from "zod";
import {
  AuthorityClassificationSchema,
  OpenObjectSchema,
  ProtocolIdSchema,
  ProtocolModeSchema,
  ProtocolOutcomeSchema,
  ProtocolVerdictSchema,
  Sha256DigestSchema,
} from "./ProtocolPrimitives";

/**
 * `POST /v1/protocol/evaluate-decision` (operationId evaluateDecision), the
 * canonical decision route. Steward sends the account event and the signals
 * it rests on; the organisation's rules, owned and versioned by the platform,
 * decide. Fields Steward does not read (the authority requirement, the
 * execution binding, the policy guard) are left out and stripped on parse.
 */
export const DecisionChainRequestSchema = z.object({
  chain_id: ProtocolIdSchema.optional(),
  workflow_id: z.string().min(1).optional(),
  step_id: z.string().min(1).optional(),
  sequence: z.number().int().min(0).optional(),
  parent_evaluation_ids: z.array(z.string().min(1)).optional(),
  parent_dossier_ids: z.array(z.string().min(1)).optional(),
  metadata: OpenObjectSchema.optional(),
});

export const EvaluateDecisionRequestSchema = z.object({
  org_id: ProtocolIdSchema.optional(),
  decision_type: z.string().min(1),
  amount: z.number().optional(),
  risk_score: z.number().min(0).max(1).optional(),
  channel: z.string().min(1).optional(),
  policy_version: z.string().min(1).optional(),
  require_exact_policy_version: z.boolean().optional(),
  objective_profile: z.string().min(1).optional(),
  mode: ProtocolModeSchema.optional(),
  decision_band: z.string().min(1).optional(),
  transaction_type: z.string().min(1).optional(),
  workflow_key: z.string().min(1).optional(),
  vertical_pack: z.string().min(1).optional(),
  context: OpenObjectSchema.optional(),
  idempotency_key: z.string().min(1).optional(),
  decision_chain: DecisionChainRequestSchema.optional(),
});

export const PolicyReferenceSchema = z.object({
  policy_id: z.string().min(1),
  revision_id: z.string().min(1),
  version: z.string().min(1),
  digest: Sha256DigestSchema,
});

export const EvaluationSemanticsSchema = z.object({
  protocol_version: z.literal("1.1"),
  evaluator_version: z.string().min(1),
  policy_schema_version: z.string().min(1),
  canonicalization: z.literal("RFC8785/JCS"),
  digest_algorithm: z.literal("SHA-256"),
  signal_normalization_version: z.string().min(1),
});

export const DecisionChainSummarySchema = z.object({
  chain_id: ProtocolIdSchema,
  workflow_id: z.string().min(1),
  step_id: z.string().min(1),
  sequence: z.number().int().nullable().optional(),
  root_evaluation_id: ProtocolIdSchema,
  parent_evaluation_ids: z.array(z.string()),
  parent_dossier_ids: z.array(z.string()),
  lineage_depth: z.number().int(),
  integrity_hash: z.string().min(1),
  chain_api_path: z.string().min(1),
  authority_classification: AuthorityClassificationSchema.optional(),
  verdict: ProtocolVerdictSchema.optional(),
  execution_binding_digest: Sha256DigestSchema.nullable().optional(),
});

/**
 * The OpenAPI types `policy_snapshot` as an open object; the Policy Snapshot
 * page (https://docs.decionis.com/docs/policy-snapshot) names these fields.
 * Anything else the platform adds is kept.
 */
export const PolicySnapshotSchema = z
  .object({
    policy_version: z.string().optional(),
    policy_bundle_id: z.string().optional(),
    rules_sha256: z.string().optional(),
    parameters_sha256: z.string().optional(),
    effective_from: z.string().nullable().optional(),
    effective_to: z.string().nullable().optional(),
    evaluated_at: z.string().optional(),
    source: z.string().optional(),
  })
  .loose();

export const VerificationEnvelopeSchema = z.object({
  verification_page_url: z.string().url(),
  verification_url: z.string().url(),
  verification_api_path: z.string().optional(),
  signature: z.string().min(1),
  signature_algorithm: z.string().optional(),
  signature_scheme: z.enum(["hmac-v1", "hmac-v2-org-scoped"]).optional(),
  link_expires_at: z.string().nullable().optional(),
});

/** Required on a response that declares protocol_version 1.1. */
export const PROTOCOL_1_1_REQUIRED = [
  "verdict",
  "authority_classification",
  "execution_eligible",
  "policy_reference",
  "evaluation_semantics",
  "input_snapshot_digest",
  "execution_binding_digest",
] as const;

export const EvaluateDecisionResponseSchema = z
  .object({
    protocol_version: z.literal("1.1").optional(),
    outcome: ProtocolOutcomeSchema,
    verdict: ProtocolVerdictSchema.optional(),
    authority_classification: AuthorityClassificationSchema.optional(),
    execution_eligible: z.boolean().optional(),
    policy_reference: PolicyReferenceSchema.optional(),
    evaluation_semantics: EvaluationSemanticsSchema.optional(),
    input_snapshot_digest: Sha256DigestSchema.optional(),
    execution_binding_digest: Sha256DigestSchema.nullable().optional(),
    confidence: z.number().min(0).max(1),
    policy_version: z.string().min(1),
    objective_profile: z.string().min(1),
    dossier_id: ProtocolIdSchema,
    dossier_sha256: z.string().nullable().optional(),
    evaluation_id: ProtocolIdSchema,
    decision_resolution_id: ProtocolIdSchema.nullable().optional(),
    ledger_entry_id: ProtocolIdSchema.nullable().optional(),
    ledger_entry_hash: z.string().nullable().optional(),
    mode: ProtocolModeSchema,
    fallback_to_legacy: z.boolean(),
    fallback_reason: z.string().nullable().optional(),
    enforcement_effect: z
      .object({
        effective_mode: ProtocolModeSchema.optional(),
        verdict_effect: z.enum(["BINDING", "OBSERVED"]).optional(),
        reason: z
          .enum([
            "enforcement_mode",
            "shadow_mode_observes_only",
            "parallel_mode_observes_only",
            "policy_guard_blocked",
          ])
          .optional(),
      })
      .optional(),
    policy_bundle_resolution: z
      .object({
        requested_policy_version: z.string().nullable().optional(),
        resolved_policy_version: z.string().nullable().optional(),
        status: z
          .enum([
            "exact_match",
            "newest_active",
            "requested_not_found",
            "policy_guard",
          ])
          .optional(),
      })
      .optional(),
    governance_metrics: OpenObjectSchema,
    decision_chain: DecisionChainSummarySchema.optional(),
    policy_snapshot: PolicySnapshotSchema.optional(),
    idempotent_replay: z.boolean(),
    verification: VerificationEnvelopeSchema.optional(),
    // Documented on the Decision Evaluation page
    // (https://docs.decionis.com/docs/decision-evaluation, "Response shape")
    // but not yet in the OpenAPI schema; optional until it is.
    reason_codes: z.array(z.string().min(1)).optional(),
    decision_domain: z.string().optional(),
    vertical_pack: z
      .object({
        key: z.string().min(1),
        source: z.string().optional(),
        workflow_key: z.string().optional(),
      })
      .loose()
      .optional(),
    reconciliation_required: z.boolean().optional(),
    reconciliation_status: z.string().optional(),
  })
  .superRefine((response, context) => {
    if (response.protocol_version !== "1.1") return;
    for (const key of PROTOCOL_1_1_REQUIRED) {
      if (response[key] === undefined) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when protocol_version is 1.1`,
        });
      }
    }
  });

export type DecisionChainRequest = z.infer<typeof DecisionChainRequestSchema>;
export type EvaluateDecisionRequest = z.infer<
  typeof EvaluateDecisionRequestSchema
>;
export type EvaluateDecisionResponse = z.infer<
  typeof EvaluateDecisionResponseSchema
>;
export type PolicySnapshot = z.infer<typeof PolicySnapshotSchema>;
