import { z } from "zod";

/** `GET /v1/health` (getHealth): connectivity before the first real call. */
export const ProtocolHealthResponseSchema = z.object({
  status: z.string().min(1),
  version: z.string().optional(),
});

export type ProtocolHealthResponse = z.infer<
  typeof ProtocolHealthResponseSchema
>;
