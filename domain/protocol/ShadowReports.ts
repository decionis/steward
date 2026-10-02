import { z } from "zod";
import {
  OpenObjectSchema,
  ProtocolIdSchema,
  ProtocolModeSchema,
  ProtocolOutcomeSchema,
  ProtocolTimestampSchema,
} from "./ProtocolPrimitives";

/**
 * `GET /v1/protocol/shadow/evaluate-decision/reports` and `/summary`
 * (listShadowEvaluateDecisionReports, summarizeShadowEvaluateDecisionReports):
 * the decisions a workspace made in shadow, which is the queue and "Recently
 * resolved" while nothing executes, and the loop measured.
 */
export const ShadowReportSchema = z.object({
  evaluation_id: ProtocolIdSchema,
  dossier_id: ProtocolIdSchema,
  created_at: ProtocolTimestampSchema,
  decision_type: z.string().min(1),
  decision_domain: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  risk_score: z.number().nullable().optional(),
  channel: z.string().nullable().optional(),
  policy_version: z.string().min(1),
  mode: ProtocolModeSchema,
  outcome: ProtocolOutcomeSchema,
  confidence: z.number().min(0).max(1),
  would_execute: z.boolean(),
  execution_action: z.enum(["CONTINUE", "STOP", "HAND_OFF", "REVIEW"]),
  reason: z.string().min(1),
  policy_guard_reason: z.string().nullable().optional(),
  policy_evaluation_resolution: z.string().nullable().optional(),
  selected_rule_id: z.string().nullable().optional(),
  dossier_api_path: z.string().min(1),
});

export const ShadowReportSummarySchema = z.object({
  total_evaluations: z.number().int().nonnegative(),
  would_approve_count: z.number().int().nonnegative(),
  would_block_count: z.number().int().nonnegative(),
  would_escalate_count: z.number().int().nonnegative(),
  review_required_count: z.number().int().nonnegative(),
  non_approve_count: z.number().int().nonnegative(),
  non_approve_rate: z.number().min(0).max(1),
  policy_mismatch_count: z.number().int().nonnegative(),
  policy_mismatch_rate: z.number().min(0).max(1),
  near_miss_count: z.number().int().nonnegative(),
  near_miss_rate: z.number().min(0).max(1),
  outcome_counts: z.record(z.string(), z.number()).optional(),
  top_decision_types: z.array(OpenObjectSchema).optional(),
  top_reason_patterns: z.array(OpenObjectSchema).optional(),
});

const ReportEnvelope = {
  service: z.string().min(1),
  protocol_version: z.string().min(1),
  generated_at: ProtocolTimestampSchema,
  org_id: ProtocolIdSchema,
  mode: ProtocolModeSchema,
  since: ProtocolTimestampSchema.nullable().optional(),
  summary: ShadowReportSummarySchema,
};

export const ShadowReportsResponseSchema = z.object({
  ...ReportEnvelope,
  count: z.number().int().nonnegative(),
  reports: z.array(ShadowReportSchema),
});

export const ShadowReportsSummaryResponseSchema = z.object(ReportEnvelope);

export interface ShadowReportQuery {
  mode?: z.infer<typeof ProtocolModeSchema>;
  limit?: number;
  since?: string;
}

export type ShadowReport = z.infer<typeof ShadowReportSchema>;
export type ShadowReportsResponse = z.infer<typeof ShadowReportsResponseSchema>;
export type ShadowReportsSummaryResponse = z.infer<
  typeof ShadowReportsSummaryResponseSchema
>;
