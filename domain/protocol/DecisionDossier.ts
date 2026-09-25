import { z } from "zod";
import {
  OpenObjectSchema,
  ProtocolIdSchema,
  ProtocolTimestampSchema,
} from "./ProtocolPrimitives";

/**
 * `GET /v1/protocol/dossiers/{dossier_id}?org_id=` (getDecisionDossier): one
 * tenant-bound Decision Dossier, the authoritative record of what was decided
 * and why. Steward reads it per request and never stores the payload.
 */
export const DecisionDossierResponseSchema = z.object({
  service: z.string().min(1),
  protocol_version: z.string().min(1),
  dossier: z.object({
    dossier_id: ProtocolIdSchema,
    org_id: ProtocolIdSchema,
    decision_evaluation_id: ProtocolIdSchema,
    dossier_payload: OpenObjectSchema,
    evidence_hashes: z.array(z.string()),
    created_at: ProtocolTimestampSchema,
    updated_at: ProtocolTimestampSchema,
  }),
});

export type DecisionDossierResponse = z.infer<
  typeof DecisionDossierResponseSchema
>;
