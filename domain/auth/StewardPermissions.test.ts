import { describe, expect, it } from "vitest";
import { StewardPermissions } from "./StewardPermissions";

describe("StewardPermissions", () => {
  it("lets approvers and admins review, and nobody else", () => {
    expect(StewardPermissions.allows(["APPROVER"], "review")).toBe(true);
    expect(StewardPermissions.allows(["ADMIN"], "review")).toBe(true);
    for (const role of [
      "VIEWER",
      "OPERATOR",
      "OPERATIONS",
      "AUDITS",
    ] as const) {
      expect(StewardPermissions.allows([role], "review")).toBe(false);
    }
  });

  it("lets operators, approvers, operations and admins collect; viewers and audits only look", () => {
    for (const role of [
      "OPERATOR",
      "APPROVER",
      "OPERATIONS",
      "ADMIN",
    ] as const) {
      expect(StewardPermissions.allows([role], "collect")).toBe(true);
    }
    expect(StewardPermissions.allows(["VIEWER"], "collect")).toBe(false);
    expect(StewardPermissions.allows(["AUDITS"], "collect")).toBe(false);
  });

  it("gives the technical team the sources and the auditors the records, each without the other", () => {
    expect(StewardPermissions.allows(["OPERATIONS"], "manage-sources")).toBe(
      true,
    );
    expect(StewardPermissions.allows(["OPERATIONS"], "read-records")).toBe(
      false,
    );
    expect(StewardPermissions.allows(["AUDITS"], "read-records")).toBe(true);
    expect(StewardPermissions.allows(["AUDITS"], "manage-sources")).toBe(false);
    expect(StewardPermissions.allows([], "read-records")).toBe(false);
    expect(StewardPermissions.rolesFor("manage-sources")).toEqual([
      "OPERATIONS",
      "ADMIN",
    ]);
  });
});
