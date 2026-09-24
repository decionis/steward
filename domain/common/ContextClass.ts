import { z } from "zod";

/**
 * What kind of situation a signal describes, as distinct from where it came
 * from (`EvidenceSignal.category`). "This came from the support desk" and
 * "this is friction" are different facts, and an operator needs both.
 *
 * Five of the six classes in the published context-engineering framework.
 * ENVIRONMENTAL (end-customer device and network state) has no producer in
 * the platform and this tier will not collect it; an enum value no producer
 * can produce is a false statement in a contract. Add it the day one exists.
 *
 * The platform supplies this. Steward never infers a class from a category:
 * a wrong class label on a regulated decision is the same defect as a wrong
 * number. See docs/ContextEngineering.md, W1.
 */
export const ContextClassSchema = z.enum([
  "JOURNEY",
  "INTENT",
  "FRICTION",
  "OPERATIONAL",
  "POLICY",
]);

export type ContextClass = z.infer<typeof ContextClassSchema>;
