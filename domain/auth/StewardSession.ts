import { z } from "zod";

/**
 * Steward's roles. The first four are the original set; `OPERATIONS` and
 * `AUDITS` were added with the kloakware plan (docs/Kloakware.md, K-D9):
 * the technical team that runs Steward, and the people who read every record
 * and change nothing. What each may do is in StewardPermissions.
 */
export const StewardRoleSchema = z.enum([
  "VIEWER",
  "OPERATOR",
  "APPROVER",
  "OPERATIONS",
  "AUDITS",
  "ADMIN",
]);

/** How the session came to be: the demo fixture, the Decionis handoff, or kloakware. */
export const StewardSignInMethodSchema = z.enum([
  "DEMO",
  "DECIONIS",
  "KLOAKWARE",
]);

export const StewardSessionSchema = z.object({
  subject: z.string().min(1),
  displayName: z.string().min(1),
  orgId: z.string().min(1),
  roles: z.array(StewardRoleSchema).min(1),
  accessToken: z.string().min(1).nullable(),
  mode: z.enum(["DEMO", "LIVE"]),
  signedInThrough: StewardSignInMethodSchema.optional(),
});

export type StewardRole = z.infer<typeof StewardRoleSchema>;
export type StewardSignInMethod = z.infer<typeof StewardSignInMethodSchema>;
export type StewardSession = z.infer<typeof StewardSessionSchema>;
