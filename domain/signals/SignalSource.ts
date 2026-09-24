import { z } from "zod";
import { SourceHealthSchema } from "@/domain/common/SourceHealth";

/** The systems an operator connects Steward to. Each is a connector under infra/connectors/. */
export const SignalSourceKindSchema = z.enum([
  "ERP",
  "CRM",
  "MCP",
  "FILE_UPLOAD",
  "FILE_SERVER",
  "SUPPORT_DESK",
  "PRODUCT_USAGE",
  "SETTLEMENT_LEDGER",
  "KYC_KYB",
]);

/**
 * Where a collected signal came from. The evidence categories the platform
 * returns, plus DOCUMENT for a signal extracted from an uploaded or fetched
 * file. This is Steward's outbound vocabulary; the platform's inbound one is
 * part of the Protocol request in docs/SignalConnectors.md.
 */
export const SignalCategorySchema = z.enum([
  "USAGE",
  "SUPPORT",
  "CRM",
  "TRANSACTION",
  "KYC_KYB",
  "DOCUMENT",
]);

export const SignalSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: SignalSourceKindSchema,
  /**
   * Where it points, as a label an operator recognises: a host name or a
   * system name. Never a credential, never a URL that carries one. The
   * credential is a mounted secret the connector reads at start.
   */
  target: z.string().min(1),
  categories: z.array(SignalCategorySchema).min(1),
  health: SourceHealthSchema,
  enabled: z.boolean(),
  lastCollectedAt: z.string().datetime().nullable(),
  signalsCollected: z.number().int().nonnegative(),
});

export type SignalSourceKind = z.infer<typeof SignalSourceKindSchema>;
export type SignalCategory = z.infer<typeof SignalCategorySchema>;
export type SignalSource = z.infer<typeof SignalSourceSchema>;
