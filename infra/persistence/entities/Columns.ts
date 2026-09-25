import type { EntitySchemaColumnOptions } from "typeorm";

/**
 * The portable column vocabulary (docs/Persistence.md, "Portability rules"):
 * identifiers as 36-character strings, timestamps as ISO-8601 UTC strings,
 * JSON as text, booleans as booleans, counts as integers. Nothing here needs
 * a dialect-specific type, so one schema serves every database.
 */
export const id = (): EntitySchemaColumnOptions => ({
  type: "varchar",
  length: 36,
  primary: true,
});
export const reference = (
  name: string,
  nullable = false,
): EntitySchemaColumnOptions => ({
  name,
  type: "varchar",
  length: 36,
  nullable,
});
export const label = (
  name: string,
  length = 200,
  nullable = false,
): EntitySchemaColumnOptions => ({ name, type: "varchar", length, nullable });
export const timestamp = (
  name: string,
  nullable = false,
): EntitySchemaColumnOptions => ({
  name,
  type: "varchar",
  length: 32,
  nullable,
});
export const text = (
  name: string,
  nullable = false,
): EntitySchemaColumnOptions => ({
  name,
  type: "text",
  nullable,
});
export const flag = (
  name: string,
  defaultValue = false,
): EntitySchemaColumnOptions => ({
  name,
  type: "boolean",
  default: defaultValue,
});
export const count = (name: string): EntitySchemaColumnOptions => ({
  name,
  type: "integer",
  default: 0,
});
