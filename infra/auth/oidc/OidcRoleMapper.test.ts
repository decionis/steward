/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { OidcRoleMapper } from "./OidcRoleMapper";

describe("OidcRoleMapper", () => {
  it("maps the steward-* realm roles onto Steward's, ignoring everything else", () => {
    expect(
      OidcRoleMapper.fromClaims({
        realm_access: {
          roles: [
            "steward-admin",
            "steward-approver",
            "offline_access",
            "steward-operations",
            "steward-audits",
            "realm-admin",
          ],
        },
      }),
    ).toEqual(["ADMIN", "APPROVER", "OPERATIONS", "AUDITS"]);
  });

  it("lands an unmapped user on the floor and never grants a role it does not know", () => {
    expect(OidcRoleMapper.fromClaims({})).toEqual(["VIEWER"]);
    expect(
      OidcRoleMapper.fromClaims({
        realm_access: { roles: ["steward-superuser", "uma_authorization"] },
      }),
    ).toEqual(["VIEWER"]);
    expect(
      OidcRoleMapper.fromClaims({
        realm_access: { roles: ["steward-viewer", "steward-viewer"] },
      }),
    ).toEqual(["VIEWER"]);
  });

  it("names the user from what the issuer sent, in order of preference", () => {
    expect(OidcRoleMapper.displayName({ sub: "s", name: "Erin Example" })).toBe(
      "Erin Example",
    );
    expect(
      OidcRoleMapper.displayName({
        sub: "s",
        given_name: "Erin",
        family_name: "Example",
      }),
    ).toBe("Erin Example");
    expect(
      OidcRoleMapper.displayName({
        sub: "s",
        preferred_username: "erin.example",
      }),
    ).toBe("erin.example");
    expect(OidcRoleMapper.displayName({ sub: "subject-only" })).toBe(
      "subject-only",
    );
  });
});
