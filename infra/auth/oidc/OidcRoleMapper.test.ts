/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { OidcRoleMapper } from "./OidcRoleMapper";

describe("OidcRoleMapper — the compact steward claim", () => {
  it("reads the roles the mapper compiled into kloakware writes, and ignores what it does not know", () => {
    expect(
      OidcRoleMapper.fromClaims({
        steward: {
          roles: ["approver", "operations", "superuser"],
          markets: ["SE"],
        },
      }),
    ).toEqual(["APPROVER", "OPERATIONS"]);
    expect(OidcRoleMapper.fromClaims({ steward: { roles: [] } })).toEqual([
      "VIEWER",
    ]);
  });

  it("prefers the compact claim over the realm roles when both are present", () => {
    expect(
      OidcRoleMapper.fromClaims({
        steward: { roles: ["audits"] },
        realm_access: { roles: ["steward-admin"] },
      }),
    ).toEqual(["AUDITS"]);
  });

  it("reads the markets from the compact claim, then from the market scope, once each", () => {
    expect(
      OidcRoleMapper.markets({ steward: { markets: ["SE", "NG", "SE"] } }),
    ).toEqual(["SE", "NG"]);
    expect(OidcRoleMapper.markets({ market: ["GB"] })).toEqual(["GB"]);
    expect(OidcRoleMapper.markets({})).toEqual([]);
  });
});

describe("OidcRoleMapper — the realm roles, as the fallback", () => {
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
});

describe("OidcRoleMapper — the person", () => {
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

  it("knows when the claims name nobody, which is what a lightweight token looks like", () => {
    expect(OidcRoleMapper.namesThePerson({ sub: "s" })).toBe(false);
    expect(OidcRoleMapper.namesThePerson({ sub: "s", name: " " })).toBe(false);
    expect(
      OidcRoleMapper.namesThePerson({ sub: "s", preferred_username: "erin" }),
    ).toBe(true);
  });
});
