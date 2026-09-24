/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

/**
 * The operator console must stay out of search indexes; the description of
 * it, the machine-discovery files, must not. Next applies every matching
 * headers() entry in order and a later entry overrides an earlier one for the
 * same key, so the override has to come after the global rule.
 */
describe("next.config headers", () => {
  it("sets noindex on every path and overrides it to all on the discovery files, in that order", async () => {
    const entries = await nextConfig.headers!();
    const robots = (headers: { key: string; value: string }[]) =>
      headers.find((header) => header.key === "X-Robots-Tag")?.value;

    const global = entries.findIndex((entry) => entry.source === "/:path*");
    const llms = entries.findIndex((entry) => entry.source === "/llms.txt");
    const full = entries.findIndex(
      (entry) => entry.source === "/llms-full.txt",
    );

    expect(global).toBeGreaterThanOrEqual(0);
    expect(robots(entries[global]!.headers)).toBe(
      "noindex, nofollow, noarchive",
    );
    expect(llms).toBeGreaterThan(global);
    expect(full).toBeGreaterThan(global);
    expect(robots(entries[llms]!.headers)).toBe("all");
    expect(robots(entries[full]!.headers)).toBe("all");
  });
});
