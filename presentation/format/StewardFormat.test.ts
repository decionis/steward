import { describe, expect, it } from "vitest";
import { StewardFormat } from "./StewardFormat";

describe("StewardFormat — percentages", () => {
  it("formats normalized confidence independently of percentage values", () => {
    // confidence() takes 0–1, percent() takes 0–100. Passing one to the other
    // is off by two orders of magnitude and still renders, so both are pinned.
    expect(StewardFormat.confidence(0.93)).toBe("93%");
    expect(StewardFormat.percent(93)).toBe("93%");
  });

  it("rounds to whole percent by default", () => {
    expect(StewardFormat.percent(92.4)).toBe("92%");
    expect(StewardFormat.confidence(0.928)).toBe("93%");
  });

  it("honours a requested precision", () => {
    expect(StewardFormat.percent(92.45, 1)).toBe("92.5%");
  });

  it("handles the boundaries", () => {
    expect(StewardFormat.percent(0)).toBe("0%");
    expect(StewardFormat.confidence(1)).toBe("100%");
  });
});

describe("StewardFormat — money", () => {
  it("formats compact monetary limits at a million and above", () => {
    expect(StewardFormat.money(1_000_000, "USD")).toContain("$1M");
  });

  it("formats standard notation below a million", () => {
    // The switch is at 1,000,000 exactly; below it the operator sees the full
    // figure, which is what a processing limit needs to be read precisely.
    const formatted = StewardFormat.money(650_000, "GBP");
    expect(formatted).toContain("650,000");
    expect(formatted).not.toContain("M");
  });

  it("respects the currency it is given", () => {
    expect(StewardFormat.money(500_000, "GBP")).toContain("£");
    expect(StewardFormat.money(500_000, "USD")).toContain("$");
  });

  it("does not render fractional currency units", () => {
    // Limits are whole amounts; trailing decimals would imply a precision the
    // upstream figure does not carry.
    expect(StewardFormat.money(1234.56, "USD")).not.toContain(".56");
  });
});

describe("StewardFormat — relativeTime", () => {
  /**
   * `now` defaults to a hardcoded 2026-07-10T15:30:00Z and every caller in the
   * application omits it, so live mode renders every timestamp against a fixed
   * point in the past. That is tracked as a defect (issue #17).
   *
   * These pass `now` explicitly. They describe what the function does when used
   * correctly, so the tests stay true once the default is removed rather than
   * pinning the bug in place.
   */
  const now = new Date("2026-07-10T15:30:00.000Z");

  it("renders minutes within the hour", () => {
    expect(StewardFormat.relativeTime("2026-07-10T15:25:00.000Z", now)).toBe(
      "5 minutes ago",
    );
  });

  it("renders hours within the day", () => {
    expect(StewardFormat.relativeTime("2026-07-10T11:30:00.000Z", now)).toBe(
      "4 hours ago",
    );
  });

  it("falls back to an absolute date beyond a day", () => {
    // Past 24 hours "3 days ago" stops being the useful framing for evidence
    // freshness, so it becomes a date.
    const formatted = StewardFormat.relativeTime(
      "2026-04-18T08:00:00.000Z",
      now,
    );
    expect(formatted).toContain("Apr");
    expect(formatted).toContain("18");
  });

  it("handles a future timestamp without inverting the phrasing", () => {
    // Clock skew between this tier and upstream can produce one. It should read
    // as the future, not as a negative interval.
    expect(StewardFormat.relativeTime("2026-07-10T15:40:00.000Z", now)).toBe(
      "in 10 minutes",
    );
  });

  it("crosses the hour boundary at sixty minutes, not before", () => {
    expect(StewardFormat.relativeTime("2026-07-10T14:31:00.000Z", now)).toBe(
      "59 minutes ago",
    );
    expect(StewardFormat.relativeTime("2026-07-10T14:30:00.000Z", now)).toBe(
      "1 hour ago",
    );
  });
});

describe("StewardFormat.count", () => {
  it("uses the singular for exactly one", () => {
    expect(StewardFormat.count(1, "decision")).toBe("1 decision");
  });

  it("uses the plural otherwise, including zero", () => {
    expect(StewardFormat.count(0, "decision")).toBe("0 decisions");
    expect(StewardFormat.count(3, "decision")).toBe("3 decisions");
  });

  it("accepts an irregular plural", () => {
    expect(StewardFormat.count(2, "entry", "entries")).toBe("2 entries");
  });
});
