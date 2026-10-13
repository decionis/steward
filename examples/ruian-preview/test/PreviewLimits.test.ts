import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@vercel/firewall";
import { PreviewLimits } from "@/server/PreviewLimits";

const request = new Request("https://preview.example/api/agent");
const releases: Array<() => void> = [];
afterEach(() => {
  releases.splice(0).forEach((release) => release());
  vi.unstubAllEnvs();
});
function production() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("PREVIEW_RATE_LIMITS_READY", "1");
}

describe("PreviewLimits", () => {
  it("checks both visitor and shared buckets before admitting a model request", async () => {
    production();
    const check = vi
      .fn<typeof checkRateLimit>()
      .mockResolvedValue({ rateLimited: false });
    releases.push(await PreviewLimits.admit(request, check));
    expect(check.mock.calls).toEqual([
      ["ruian-preview-ip", { request, rateLimitKey: undefined, timeout: 2000 }],
      [
        "ruian-preview-ip",
        { request, rateLimitKey: "ruian-preview-all", timeout: 2000 },
      ],
    ]);
  });

  it.each(["VERCEL", "PREVIEW_RATE_LIMITS_READY"])(
    "fails closed when %s is not ready",
    async (name) => {
      production();
      vi.stubEnv(name, "0");
      const check = vi.fn<typeof checkRateLimit>();
      await expect(PreviewLimits.admit(request, check)).rejects.toMatchObject({
        code: "PREVIEW_PAUSED",
      });
      expect(check).not.toHaveBeenCalled();
    },
  );

  it("fails closed if the firewall cannot find its rule", async () => {
    production();
    const check = vi
      .fn<typeof checkRateLimit>()
      .mockResolvedValue({ rateLimited: false, error: "not-found" });
    await expect(PreviewLimits.admit(request, check)).rejects.toMatchObject({
      code: "PREVIEW_PAUSED",
    });
  });

  it("rejects the shared budget even when the visitor has capacity", async () => {
    production();
    const check = vi
      .fn<typeof checkRateLimit>()
      .mockResolvedValueOnce({ rateLimited: false })
      .mockResolvedValueOnce({ rateLimited: true });
    await expect(PreviewLimits.admit(request, check)).rejects.toMatchObject({
      status: 429,
      code: "PREVIEW_LIMIT_REACHED",
    });
  });

  it("bounds concurrent local requests and releases a slot only once", async () => {
    vi.stubEnv("NODE_ENV", "test");
    for (let i = 0; i < 4; i++)
      releases.push(await PreviewLimits.admit(request));
    await expect(PreviewLimits.admit(request)).rejects.toMatchObject({
      code: "PREVIEW_BUSY",
    });
    const release = releases.shift()!;
    release();
    release();
    releases.push(await PreviewLimits.admit(request));
    await expect(PreviewLimits.admit(request)).rejects.toMatchObject({
      code: "PREVIEW_BUSY",
    });
  });
});
