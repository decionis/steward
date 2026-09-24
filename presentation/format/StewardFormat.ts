export class StewardFormat {
  static percent(value: number, maximumFractionDigits = 0): string {
    return new Intl.NumberFormat("en", {
      style: "percent",
      maximumFractionDigits,
    }).format(value / 100);
  }

  static confidence(value: number): string {
    return new Intl.NumberFormat("en", {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(value);
  }

  /**
   * "1 decision", "3 decisions". Headings that carry a count read wrong the
   * moment the count is one, and the queue now has a group that is often
   * exactly one item long.
   */
  static count(
    value: number,
    singular: string,
    plural = `${singular}s`,
  ): string {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  static money(amount: number, currency: string): string {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      notation: amount >= 1_000_000 ? "compact" : "standard",
    }).format(amount);
  }

  /**
   * `now` is required on purpose. It previously defaulted to the demo fixture's
   * timestamp, and every caller omitted it — so in live mode every relative
   * time was measured against a fixed point in the past. A required argument
   * makes the time dependence visible at the call site; RelativeTime is the one
   * component that supplies it.
   */
  static relativeTime(value: string, now: Date): string {
    const differenceMinutes = Math.round(
      (new Date(value).getTime() - now.getTime()) / 60_000,
    );
    const absoluteMinutes = Math.abs(differenceMinutes);
    if (absoluteMinutes < 60) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        differenceMinutes,
        "minute",
      );
    }
    const differenceHours = Math.round(differenceMinutes / 60);
    if (Math.abs(differenceHours) < 24) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        differenceHours,
        "hour",
      );
    }
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  }
}
