import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewApi } from "@/server/PreviewApi";
import { AzureModelClient } from "@/server/AzureModelClient";
import { PreviewAgent } from "@/server/PreviewAgent";
import { PreviewLimits } from "@/server/PreviewLimits";
import { PreviewError } from "@/server/ModelClient";

const valid = { mode: "discover", prompt: "A quiet lunch" };
function request(body: unknown = valid, headers: Record<string, string> = {}) {
  return new Request("https://preview.example/api/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://preview.example",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
afterEach(() => vi.restoreAllMocks());

describe("PreviewApi", () => {
  it("uses the browser host even when Next normalizes the internal URL", async () => {
    const local = new Request("http://localhost:3004/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:3004",
        Host: "127.0.0.1:3004",
      },
      body: JSON.stringify(valid),
    });
    expect(await PreviewApi.body(local)).toEqual(valid);
  });

  it.each([
    [403, { Origin: "https://unrelated.example" }],
    [403, { Origin: "null" }],
    [415, { "Content-Type": "text/plain" }],
  ])(
    "rejects wrong origin or content type with %i",
    async (status, headers) => {
      expect(
        (
          await PreviewApi.post(
            request(valid, headers as Record<string, string>),
          )
        ).status,
      ).toBe(status);
    },
  );

  it.each([
    [400, "{"],
    [413, "x".repeat(4097)],
    [400, { ...valid, prompt: "x".repeat(701) }],
    [400, { ...valid, secret: "unexpected" }],
    [
      400,
      {
        mode: "journey",
        prompt: "Invite Alex",
        merchantId: "juniper",
        consent: false,
      },
    ],
    [400, { mode: "service", prompt: "Where is the shop?" }],
  ])(
    "rejects invalid input before contacting the model",
    async (status, body) => {
      const create = vi.spyOn(AzureModelClient, "fromEnvironment");
      expect((await PreviewApi.post(request(body))).status).toBe(status);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("returns generic failures and releases concurrency after a model error", async () => {
    vi.spyOn(AzureModelClient, "fromEnvironment").mockReturnValue(
      {} as AzureModelClient,
    );
    const release = vi.fn();
    vi.spyOn(PreviewLimits, "admit").mockResolvedValue(release);
    vi.spyOn(PreviewAgent.prototype, "run").mockRejectedValue(
      new Error("secret provider diagnostic"),
    );
    const response = await PreviewApi.post(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "PREVIEW_UNAVAILABLE" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("returns retry information without running the model when throttled", async () => {
    vi.spyOn(AzureModelClient, "fromEnvironment").mockReturnValue(
      {} as AzureModelClient,
    );
    vi.spyOn(PreviewLimits, "admit").mockRejectedValue(
      new PreviewError("PREVIEW_LIMIT_REACHED", 429),
    );
    const run = vi.spyOn(PreviewAgent.prototype, "run");
    const response = await PreviewApi.post(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(run).not.toHaveBeenCalled();
  });
});
