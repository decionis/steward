import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { User } from "./entities";

/**
 * Kloakware's Steward user storage reads the `users` table with one SELECT,
 * kept in the extension's JAR. This pins the columns it names to the ones the
 * entity provides, so a rename on either side fails here, not at an
 * operator's sign-in.
 */
describe("the kloakware steward-users contract", () => {
  it("names only columns the users entity provides", () => {
    const sql = readFileSync(
      "kloakware/extensions/user-storage-steward/src/main/resources/com/decionis/kloakware/users/steward-users.sql",
      "utf8",
    )
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("--"))
      .join(" ");
    const columns = /^SELECT (.+) FROM users$/i.exec(sql.trim())?.[1] ?? "";
    expect(columns, "one SELECT over users").not.toBe("");
    const wanted = columns.split(",").map((column) => column.trim());
    // A column without a name of its own is called after its property.
    const provided = Object.entries(User.options.columns ?? {}).map(
      ([property, column]) => column?.name ?? property,
    );
    for (const column of wanted) {
      expect(provided, `the users entity provides ${column}`).toContain(column);
    }
    expect(wanted).toEqual([
      "id",
      "email",
      "display_name",
      "password_hash",
      "roles",
      "status",
    ]);
  });
});
