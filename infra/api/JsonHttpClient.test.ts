/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StewardGatewayError } from "@/infra/errors/StewardErrors";
import { JsonHttpClient, type FetchClient } from "./JsonHttpClient";

const PayloadSchema = z.object({ ok: z.boolean() });

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function clientWith(
  respond: (call: RecordedCall) => Response | Promise<Response>,
  options: Partial<{ baseUrl: string; timeoutMs: number }> = {},
) {
  const calls: RecordedCall[] = [];
  const fetchClient: FetchClient = (input, init = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return Promise.resolve(respond(call));
  };

  const client = new JsonHttpClient({
    baseUrl: options.baseUrl ?? "https://api.decionis.com",
    bearerToken: "secret-token",
    orgId: "org-42",
    timeoutMs: options.timeoutMs ?? 8_000,
    fetchClient,
  });

  return { client, calls };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Asserts a request was actually made, rather than asserting against undefined. */
function onlyCall(calls: RecordedCall[]): RecordedCall {
  const [call, ...rest] = calls;
  if (!call) throw new Error("expected exactly one request, got none");
  if (rest.length > 0) {
    throw new Error(`expected exactly one request, got ${calls.length}`);
  }
  return call;
}

describe("JsonHttpClient", () => {
  it("sends the bearer token and org scope as headers", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

    await client.get("/v1/cdi/portfolio", PayloadSchema);

    const headers = onlyCall(calls).init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-token");
    expect(headers["x-decionis-org-id"]).toBe("org-42");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("never places the credential in the request URL", async () => {
    // Tokens in query strings leak into proxy logs, browser history, and
    // referrer headers. They belong in the Authorization header only.
    const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

    await client.get("/v1/cdi/portfolio", PayloadSchema);

    expect(onlyCall(calls).url).not.toContain("secret-token");
  });

  it("disables caching so an operator never sees a stale decision", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

    await client.get("/v1/cdi/portfolio", PayloadSchema);

    expect(onlyCall(calls).init.cache).toBe("no-store");
  });

  it("normalizes a base URL with trailing slashes", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ ok: true }), {
      baseUrl: "https://api.decionis.com///",
    });

    await client.get("/v1/cdi/portfolio", PayloadSchema);

    expect(onlyCall(calls).url).toBe(
      "https://api.decionis.com/v1/cdi/portfolio",
    );
  });

  it("serializes a POST body as JSON", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

    await client.post(
      "/v1/cdi/reviews",
      { decision: "APPROVE" },
      PayloadSchema,
    );

    const call = onlyCall(calls);
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe('{"decision":"APPROVE"}');
  });

  it("parses a successful response through its schema", async () => {
    const { client } = clientWith(() => jsonResponse({ ok: true }));

    await expect(
      client.get("/v1/cdi/portfolio", PayloadSchema),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects a response that does not match its schema", async () => {
    // Schema drift upstream must fail at the boundary rather than surface as a
    // subtly wrong value on an operator's screen.
    const { client } = clientWith(() => jsonResponse({ ok: "yes" }));

    await expect(
      client.get("/v1/cdi/portfolio", PayloadSchema),
    ).rejects.toThrowError();
  });

  it("raises a gateway error carrying the upstream status and message", async () => {
    const { client } = clientWith(() =>
      jsonResponse({ message: "Org is not entitled" }, 403),
    );

    const error = await client
      .get("/v1/cdi/portfolio", PayloadSchema)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StewardGatewayError);
    expect((error as StewardGatewayError).status).toBe(403);
    expect((error as StewardGatewayError).message).toBe("Org is not entitled");
  });

  it("falls back to the status text when the error body has no message", async () => {
    const { client } = clientWith(
      () =>
        new Response("", { status: 503, statusText: "Service Unavailable" }),
    );

    const error = await client
      .get("/v1/cdi/portfolio", PayloadSchema)
      .catch((thrown: unknown) => thrown);

    expect((error as StewardGatewayError).message).toBe("Service Unavailable");
  });

  it("wraps a non-JSON error body rather than throwing on the parse", async () => {
    // Upstream proxies return HTML error pages; that must surface as a gateway
    // error, not as a JSON parse failure that masks the real status.
    const { client } = clientWith(
      () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    const error = await client
      .get("/v1/cdi/portfolio", PayloadSchema)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(StewardGatewayError);
    expect((error as StewardGatewayError).status).toBe(502);
    expect((error as StewardGatewayError).message).toContain("502 Bad Gateway");
  });

  it("treats an empty successful body as an empty object", async () => {
    const { client } = clientWith(() => new Response("", { status: 200 }));

    await expect(
      client.get("/v1/cdi/portfolio", z.object({}).passthrough()),
    ).resolves.toEqual({});
  });

  it("aborts the request once the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const client = new JsonHttpClient({
        baseUrl: "https://api.decionis.com",
        bearerToken: "secret-token",
        orgId: "org-42",
        timeoutMs: 8_000,
        fetchClient: (_input, init = {}) => {
          capturedSignal = init.signal ?? undefined;
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          });
        },
      });

      const pending = client.get("/v1/cdi/portfolio", PayloadSchema);
      const assertion = expect(pending).rejects.toThrowError("aborted");

      expect(capturedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(capturedSignal?.aborted).toBe(true);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout when the request completes in time", async () => {
    vi.useFakeTimers();
    try {
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");
      const { client } = clientWith(() => jsonResponse({ ok: true }));

      await client.get("/v1/cdi/portfolio", PayloadSchema);

      expect(clearSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds per-request headers without letting them replace the credential", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ ok: true }));

    await client.post("/v1/x", {}, PayloadSchema, {
      "Idempotency-Key": "key-1",
      authorization: "Bearer attacker",
    });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("key-1");
    expect(headers.authorization).toBe("Bearer secret-token");
  });

  it("omits the org header when the client is scoped by body and query instead", async () => {
    const calls: RecordedCall[] = [];
    const client = new JsonHttpClient({
      baseUrl: "https://api.decionis.com",
      bearerToken: "secret-token",
      timeoutMs: 8_000,
      fetchClient: (input, init = {}) => {
        calls.push({ url: String(input), init });
        return Promise.resolve(jsonResponse({ ok: true }));
      },
    });

    await client.get("/v1/health", PayloadSchema);

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("x-decionis-org-id");
  });

  it("reads the Protocol's error code when its error body has no message", async () => {
    const { client } = clientWith(() =>
      jsonResponse({ error: "invalid_credentials", status: 401 }, 401),
    );

    await expect(client.get("/v1/x", PayloadSchema)).rejects.toThrow(
      "invalid_credentials",
    );
  });
});
