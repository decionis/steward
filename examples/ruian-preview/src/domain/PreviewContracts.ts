import { z } from "zod";

export const ModeSchema = z.enum(["discover", "journey", "content", "service"]);
export type PreviewMode = z.infer<typeof ModeSchema>;
export const RequestSchema = z
  .object({
    mode: ModeSchema,
    prompt: z.string().trim().min(3).max(700),
    merchantId: z.enum(["juniper", "form-field"]).optional(),
    consent: z.boolean().optional(),
  })
  .strict();
export type PreviewRequest = z.infer<typeof RequestSchema>;

export const ResultSchema = z
  .object({
    headline: z.string().min(1).max(90),
    summary: z.string().min(1).max(800),
    productIds: z.array(z.string().max(50)).max(3),
    sections: z
      .array(
        z
          .object({
            title: z.string().min(1).max(70),
            body: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(4),
    caption: z.string().max(700),
    callToAction: z.string().max(70),
  })
  .strict();
export type PreviewResult = z.infer<typeof ResultSchema>;
export interface AgentResponse extends PreviewResult {
  mode: PreviewMode;
  generated: true;
  sources: string[];
  tools: string[];
}

export const LookupSchema = z
  .object({
    category: z.enum(["food", "drink", "gift", "experience"]).optional(),
    maxPrice: z.number().min(0).max(1000).optional(),
    maxMinutes: z.number().min(0).max(240).optional(),
  })
  .strict();
