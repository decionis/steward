import { z } from "zod";
import { ContextClassSchema } from "@/domain/common/ContextClass";
import { SignalCategorySchema } from "./SignalSource";

/**
 * The minimum viable payload: what the decisioning engine needs to weigh a
 * signal, and nothing that would make Steward a store. A connector produces
 * these; a batch of them is forwarded over the Decionis Protocol; the platform
 * resolves the account reference to an account and does the weighing.
 */
export const CapturedSignalSchema = z.object({
  /** Stable within the source, so a re-collection does not duplicate. */
  id: z.string().min(1),
  sourceId: z.string().min(1),
  /** The record in the source system; provenance on the evidence panel. */
  sourceRecordId: z.string().min(1),
  /** The account as the source knows it. Identity resolution is the platform's. */
  accountReference: z.string().min(1),
  observedAt: z.string().datetime(),
  capturedAt: z.string().datetime(),
  category: SignalCategorySchema,
  /** A connector may know it (a support ticket is FRICTION); otherwise the platform assigns it. */
  contextClass: ContextClassSchema.optional(),
  title: z.string().min(1),
  detail: z.string().min(1),
  /** The connector's confidence in the extraction. */
  confidence: z.number().min(0).max(1),
});

export const SignalBatchSchema = z.object({
  batchId: z.string().min(1),
  sourceId: z.string().min(1),
  collectedAt: z.string().datetime(),
  signals: z.array(CapturedSignalSchema),
});

export const SignalForwardResultSchema = z.object({
  batchId: z.string().min(1),
  accepted: z.number().int().nonnegative(),
  rejected: z.array(
    z.object({ signalId: z.string().min(1), reason: z.string().min(1) }),
  ),
  receivedAt: z.string().datetime(),
});

export type CapturedSignal = z.infer<typeof CapturedSignalSchema>;
export type SignalBatch = z.infer<typeof SignalBatchSchema>;
export type SignalForwardResult = z.infer<typeof SignalForwardResultSchema>;
