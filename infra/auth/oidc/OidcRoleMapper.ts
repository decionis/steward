import {
  StewardRoleSchema,
  type StewardRole,
} from "@/domain/auth/StewardSession";
import type { IdTokenClaims, UserInfoClaims } from "./OidcProvider";

/**
 * The roles kloakware assigns, onto Steward's. The compact `steward` claim
 * (K4: `{ roles: ["approver"], markets: ["SE"] }`, from the mapper compiled
 * into the server) is read first; a realm without it still works through the
 * `steward-*` realm roles in `realm_access`. A role the mapper does not know
 * grants nothing; a user with no known role lands on the floor, VIEWER,
 * exactly as the Decionis handoff's role parsing does.
 */
export class OidcRoleMapper {
  static readonly PREFIX = "steward-";

  static fromClaims(
    claims: Pick<IdTokenClaims, "realm_access" | "steward">,
  ): StewardRole[] {
    const compact = claims.steward?.roles;
    const names = Array.isArray(compact)
      ? compact.map((name) => String(name).toUpperCase())
      : (claims.realm_access?.roles ?? [])
          .filter((name) => name.startsWith(OidcRoleMapper.PREFIX))
          .map((name) =>
            name.slice(OidcRoleMapper.PREFIX.length).toUpperCase(),
          );
    const roles = names.filter((name): name is StewardRole =>
      StewardRoleSchema.options.includes(name as StewardRole),
    );
    const unique = [...new Set(roles)];
    return unique.length > 0 ? unique : ["VIEWER"];
  }

  /** The markets the user works, from the compact claim or the market scope's claim; empty when neither is there. */
  static markets(claims: Pick<IdTokenClaims, "steward" | "market">): string[] {
    const compact = claims.steward?.markets;
    const values = Array.isArray(compact) ? compact : (claims.market ?? []);
    return [...new Set(values.map((value) => String(value)))];
  }

  /** A display name from what the issuer sent, falling back to the username, then the subject. */
  static displayName(claims: UserInfoClaims): string {
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

  /** Whether the claims name the person at all: a lightweight token does not. */
  static namesThePerson(claims: UserInfoClaims): boolean {
    return Boolean(
      claims.name?.trim() ||
      claims.given_name?.trim() ||
      claims.family_name?.trim() ||
      claims.preferred_username?.trim(),
    );
  }
}
