import { z } from "zod";

/**
 * The Decionis Protocol's published signal ingress
 * (https://decionis.com/docs/webhooks, "Inbound contract"):
 * `POST /v1/signals/webhooks/:connectorId` takes one or more normalized
 * provider events, each with a type, an ISO-8601 UTC timestamp and a data
 * object of mapped business fields. Steward is one provider among many; this
 * is the shape it sends, parsed before it leaves the process.
 */
export const IngressEventSchema = z.object({
  type: z.string().min(1),
  timestamp: z.string().datetime(),
  data: z.record(z.string(), z.unknown()),
});

export const IngressRequestSchema = z.object({
  events: z.array(IngressEventSchema).min(1),
});

export type IngressEvent = z.infer<typeof IngressEventSchema>;
export type IngressRequest = z.infer<typeof IngressRequestSchema>;
