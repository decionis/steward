import { z } from "zod";
import { ContextClassSchema } from "@/domain/common/ContextClass";

export const EvidenceImpactSchema = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]);
export const EvidenceFreshnessSchema = z.enum([
  "LIVE",
  "CURRENT",
  "AGING",
  "STALE",
]);

export const EvidenceSignalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
  source: z.string().min(1),
  sourceRecordId: z.string().min(1),
  observedAt: z.string().datetime(),
  freshness: EvidenceFreshnessSchema,
  confidence: z.number().min(0).max(1),
  impact: EvidenceImpactSchema,
  category: z.enum(["USAGE", "SUPPORT", "CRM", "TRANSACTION", "KYC_KYB"]),
  /** Optional until the platform ships it. Absent renders as absent, never as a guess. */
  contextClass: ContextClassSchema.optional(),
});

export type EvidenceSignal = z.infer<typeof EvidenceSignalSchema>;
