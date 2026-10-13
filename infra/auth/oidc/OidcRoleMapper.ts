import {
  StewardRoleSchema,
  type StewardRole,
} from "@/domain/auth/StewardSession";
import type { IdTokenClaims } from "./OidcProvider";

/**
 * The realm roles kloakware assigns, `steward-viewer` to `steward-admin`,
 * onto Steward's roles. A role the mapper does not know grants nothing; a
 * user with no known role lands on the floor, VIEWER, exactly as the
 * Decionis handoff's role parsing does.
 */
export class OidcRoleMapper {
  static readonly PREFIX = "steward-";

  static fromClaims(
    claims: Pick<IdTokenClaims, "realm_access">,
  ): StewardRole[] {
    const names = claims.realm_access?.roles ?? [];
    const roles = names
      .filter((name) => name.startsWith(OidcRoleMapper.PREFIX))
      .map((name) => name.slice(OidcRoleMapper.PREFIX.length).toUpperCase())
      .filter((name): name is StewardRole =>
        StewardRoleSchema.options.includes(name as StewardRole),
      );
    const unique = [...new Set(roles)];
    return unique.length > 0 ? unique : ["VIEWER"];
  }

  /** A display name from what the issuer sent, falling back to the username, then the subject. */
  static displayName(claims: IdTokenClaims): string {
    const full = [claims.given_name, claims.family_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return (
      claims.name?.trim() ||
      full ||
      claims.preferred_username?.trim() ||
      claims.sub
    );
  }
}
