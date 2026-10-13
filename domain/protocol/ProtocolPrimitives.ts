import { z } from "zod";

/**
 * The vocabulary the published Decionis Protocol uses across operations
 * (OpenAPI "Decionis Policy Evaluation API" 0.5.0,
 * https://decionis.com/.well-known/openapi.json, documented at
 * https://docs.decionis.com/). Steward speaks this contract as a third-party
 * application and asks the Protocol for nothing of its own
 * (docs/ProtocolContracts.md).
 */
export const ProtocolModeSchema = z.enum(["SHADOW", "PARALLEL", "ENFORCEMENT"]);

/** The wire spelling of a governed result: APPROVE, ESCALATE, REJECT, REVIEW. */
export const ProtocolOutcomeSchema = z.enum([
  "APPROVE",
  "ESCALATE",
  "REJECT",
  "REVIEW",
]);

/** The verdict class: ALLOW, ESCALATE, BLOCK. Present from protocol 1.1. */
export const ProtocolVerdictSchema = z.enum(["ALLOW", "ESCALATE", "BLOCK"]);

export const AuthorityClassificationSchema = z.enum([
  "AUTHORITATIVE",
  "OBSERVATIONAL",
]);

/** OpenAPI `format: uuid`; any 8-4-4-4-12 hexadecimal identifier. */
export const ProtocolIdSchema = z.guid();

/** OpenAPI `format: date-time`, with or without an offset. */
export const ProtocolTimestampSchema = z.string().datetime({ offset: true });

export const Sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "expected sha256:<64 lowercase hex>");

/** An object the Protocol leaves open; kept whole, never interpreted here. */
export const OpenObjectSchema = z.record(z.string(), z.unknown());

export type ProtocolMode = z.infer<typeof ProtocolModeSchema>;
export type ProtocolOutcome = z.infer<typeof ProtocolOutcomeSchema>;
export type ProtocolVerdict = z.infer<typeof ProtocolVerdictSchema>;
