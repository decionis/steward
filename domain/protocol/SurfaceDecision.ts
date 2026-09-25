import { z } from "zod";
import { OpenObjectSchema, ProtocolIdSchema } from "./ProtocolPrimitives";

/**
 * `POST /v1/protocol/surfaces/decisions` (federateSurfaceDecision): an
 * operator's review recorded as a surface decision on a dossier, into the
 * organisation's audit ledger (decision D4). Steward is the surface.
 */
export const SurfaceDecisionRequestSchema = z.object({
  surface: z.string().min(1),
  decision: z.enum(["authorize", "block", "review"]),
  dossier_id: z.string().min(1),
  dossier_sha256: z.string().min(1),
  org_id: ProtocolIdSchema.optional(),
  mode: z.enum(["shadow", "enforced"]).optional(),
  dossier: OpenObjectSchema.optional(),
});

export const SurfaceDecisionResponseSchema = z.object({
  federated: z.boolean().optional(),
  persisted: z.boolean().optional(),
  surface: z.string().optional(),
  org_id: z.string().optional(),
  dossier_id: z.string().optional(),
  ledger_entry_id: z.string().nullable().optional(),
  ledger_entry_hash: z.string().nullable().optional(),
  ledger_error: z.string().nullable().optional(),
});

export type SurfaceDecisionRequest = z.infer<
  typeof SurfaceDecisionRequestSchema
>;
export type SurfaceDecisionResponse = z.infer<
  typeof SurfaceDecisionResponseSchema
>;
