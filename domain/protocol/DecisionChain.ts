import { z } from "zod";
import {
  AuthorityClassificationSchema,
  OpenObjectSchema,
  ProtocolIdSchema,
  ProtocolTimestampSchema,
  ProtocolVerdictSchema,
  Sha256DigestSchema,
} from "./ProtocolPrimitives";

/**
 * `GET /v1/protocol/decision-chains/{chain_id}` and
 * `/by-evaluation/{evaluation_id}` (getDecisionChain,
 * getDecisionChainByEvaluation): workflow lineage across related decisions,
 * and the evidence lineage (CLAIM, DISPATCH, FINALIZATION, EFFECT) that gives
 * the account timeline its ACTION and OUTCOME entries.
 */
export const DecisionChainLinkSchema = z.object({
  id: ProtocolIdSchema,
  chain_id: ProtocolIdSchema,
  workflow_id: z.string().min(1),
  step_id: z.string().min(1),
  sequence: z.number().int().nullable().optional(),
  decision_evaluation_id: ProtocolIdSchema,
  dossier_id: ProtocolIdSchema,
  parent_evaluation_ids: z.array(z.string()),
  parent_dossier_ids: z.array(z.string()),
  root_evaluation_id: ProtocolIdSchema,
  lineage_depth: z.number().int(),
  integrity_hash: z.string().min(1),
  integrity_verified: z.boolean(),
  outcome: z.string().optional(),
  policy_version: z.string().optional(),
  authority_classification: AuthorityClassificationSchema.nullable().optional(),
  verdict: ProtocolVerdictSchema.nullable().optional(),
  execution_binding_digest: Sha256DigestSchema.nullable().optional(),
  dossier_api_path: z.string().min(1),
  created_at: ProtocolTimestampSchema,
});

export const EvidenceLineageEntrySchema = z.object({
  stage: z.enum(["CLAIM", "DISPATCH", "FINALIZATION", "EFFECT"]),
  evaluation_id: ProtocolIdSchema,
  dossier_id: ProtocolIdSchema,
  status: z.string().min(1),
  occurred_at: ProtocolTimestampSchema,
  ledger_entry_id: ProtocolIdSchema,
  ledger_entry_hash: z.string().regex(/^[0-9a-f]{64}$/),
  evidence_digest: Sha256DigestSchema,
  evidence_hash_verified: z.boolean(),
  execution_correlation_id: z.string().min(1),
  binding_digest: Sha256DigestSchema.nullable(),
  observed_at: ProtocolTimestampSchema.nullable(),
  observation_method: z.string().nullable(),
  observer: OpenObjectSchema.nullable(),
  expected_effect_digest: Sha256DigestSchema.nullable(),
  observed_effect_digest: Sha256DigestSchema.nullable(),
  evidence_reference: z.string().nullable(),
});

export const DecisionChainResponseSchema = z.object({
  service: z.string().min(1),
  protocol_version: z.string().min(1),
  org_id: ProtocolIdSchema,
  chain_id: ProtocolIdSchema,
  workflow_id: z.string().nullable().optional(),
  root_evaluation_id: ProtocolIdSchema.nullable().optional(),
  count: z.number().int().nonnegative(),
  max_lineage_depth: z.number().int().nonnegative(),
  integrity_verified: z.boolean(),
  ledger_verification: z.object({
    valid: z.boolean(),
    complete: z.boolean(),
    checked: z.number().int().min(0),
    max_entries: z.number().int().min(1).max(50_000),
  }),
  links: z.array(DecisionChainLinkSchema),
  link_limit: z.number().int().min(1).max(500),
  links_truncated: z.boolean(),
  evidence_lineage: z.array(EvidenceLineageEntrySchema),
  evidence_lineage_limit: z.number().int().min(1).max(500),
  evidence_lineage_truncated: z.boolean(),
});

export type DecisionChainLink = z.infer<typeof DecisionChainLinkSchema>;
export type EvidenceLineageEntry = z.infer<typeof EvidenceLineageEntrySchema>;
export type DecisionChainResponse = z.infer<typeof DecisionChainResponseSchema>;
