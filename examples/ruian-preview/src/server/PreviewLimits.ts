import { checkRateLimit } from "@vercel/firewall";
import { PreviewError } from "./ModelClient";

export class PreviewLimits {
  private static inFlight = 0;

  static async admit(
    request: Request,
    check = checkRateLimit,
  ): Promise<() => void> {
    if (process.env.NODE_ENV === "production") {
      if (
        process.env.VERCEL !== "1" ||
        process.env.PREVIEW_RATE_LIMITS_READY !== "1"
      )
        throw new PreviewError("PREVIEW_PAUSED");
      for (const [id, key] of [
        ["ruian-preview-ip", undefined],
        ["ruian-preview-ip", "ruian-preview-all"],
      ] as const) {
        const result = await check(id, {
          request,
          rateLimitKey: key,
          timeout: 2000,
        });
        if (result.error) throw new PreviewError("PREVIEW_PAUSED");
        if (result.rateLimited)
          throw new PreviewError("PREVIEW_LIMIT_REACHED", 429);
      }
    }
    if (this.inFlight >= 4) throw new PreviewError("PREVIEW_BUSY");
    this.inFlight++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.inFlight--;
      }
    };
  }
}
