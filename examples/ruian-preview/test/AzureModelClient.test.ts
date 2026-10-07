import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureModelClient } from "@/server/AzureModelClient";
import type { ModelRequest } from "@/server/ModelClient";

const request: ModelRequest = {
  instructions: "Read sample facts only.",
  input: [{ role: "user", content: "A sample lunch" }],
  tools: [{ type: "function", name: "read_merchant_context" }],
  toolName: "read_merchant_context",
  signal: new AbortController().signal,
};
afterEach(() => vi.unstubAllEnvs());

describe("AzureModelClient", () => {
  it("uses bounded non-stored Responses calls and keeps the key out of request data", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [{ type: "function_call" }],
      }),
    );
    const client = new AzureModelClient(
      "https://sample.cognitiveservices.azure.com/",
      "test-secret",
      "deployment",
      transport,
    );
    await client.respond(request);
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://sample.cognitiveservices.azure.com/openai/v1/responses",
    );
    expect(options).toMatchObject({
      signal: request.signal,
      redirect: "error",
      cache: "no-store",
    });
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({
      store: false,
      max_output_tokens: 1500,
      parallel_tool_calls: false,
      tool_choice: { type: "function", name: "read_merchant_context" },
    });
    expect(options!.body).not.toContain("test-secret");
    expect(new Headers(options!.headers).get("api-key")).toBe("test-secret");
  });

  it.each([
    "http://sample.openai.azure.com/",
    "https://attacker.example/",
    "https://sample.openai.azure.com.attacker.example/",
    "https://user:pass@sample.openai.azure.com/",
    "https://sample.openai.azure.com/path",
    "https://sample.openai.azure.com/?key=value",
    "https://sample.openai.azure.com:8443/",
  ])("rejects an untrusted endpoint %s", (endpoint) => {
    expect(() => new AzureModelClient(endpoint, "key", "model")).toThrow(
      "MODEL_NOT_CONFIGURED",
    );
  });

  it("does not propagate provider error bodies", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("private provider details", { status: 429 }),
      );
    await expect(
      new AzureModelClient(
        "https://sample.openai.azure.com/",
        "key",
        "model",
        transport,
      ).respond(request),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: "wrong type" },
    { status: "completed", output: Array.from({ length: 9 }, () => ({})) },
  ])("rejects incomplete or malformed outputs", async (data) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(data));
    await expect(
      new AzureModelClient(
        "https://sample.openai.azure.com/",
        "key",
        "model",
        transport,
      ).respond(request),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
  });

  it("caps the response body", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("a".repeat(100_001)));
    await expect(
      new AzureModelClient(
        "https://sample.openai.azure.com/",
        "key",
        "model",
        transport,
      ).respond(request),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_RESPONSE" });
  });

  it("keeps the model off unless explicitly enabled", () => {
    vi.stubEnv("PREVIEW_LLM_ENABLED", "0");
    expect(() => AzureModelClient.fromEnvironment()).toThrow("PREVIEW_PAUSED");
  });
});
