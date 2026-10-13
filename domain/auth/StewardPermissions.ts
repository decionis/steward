import type { StewardRole } from "./StewardSession";

/**
 * What a role may do in Steward's interface. One table, read by the
 * application services and by the pages that show or hide a control, so the
 * two cannot disagree. Every role may see the queue, the accounts and the
 * evidence; this is about acting.
 *
 * The platform re-authorises every write it receives with the org API key;
 * these grants decide what the interface offers, not what the platform
 * accepts (ThreatModel.md, T2).
 */
export type StewardAction =
  "review" | "collect" | "manage-sources" | "read-records";

const GRANTS: Record<StewardAction, readonly StewardRole[]> = {
  /** Approve, hold or reject a recommendation. */
  review: ["APPROVER", "ADMIN"],
  /** Pull a batch from a configured signal source and forward it. */
  collect: ["OPERATOR", "APPROVER", "OPERATIONS", "ADMIN"],
  /** Add, edit, rotate or disable a signal source or the workspace connection. */
  "manage-sources": ["OPERATIONS", "ADMIN"],
  /** Read every record Steward keeps: activities, reviews, decisions, collections. */
  "read-records": ["AUDITS", "ADMIN"],
};

export class StewardPermissions {
  static allows(roles: readonly StewardRole[], action: StewardAction): boolean {
    const granted = GRANTS[action];
    return roles.some((role) => granted.includes(role));
  }

  static rolesFor(action: StewardAction): readonly StewardRole[] {
    return GRANTS[action];
  }
}
