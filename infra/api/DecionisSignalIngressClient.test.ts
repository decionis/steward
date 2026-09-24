/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from "vitest";
import type { IngressRequest } from "@/domain/signals/SignalIngress";
import {
  StewardGatewayError,
  StewardUnavailableError,
} from "@/infra/errors/StewardErrors";
import { DecionisSignalIngressClient } from "./DecionisSignalIngressClient";
import type { FetchClient } from "./JsonHttpClient";

const SECRET = "whsec_never_in_a_url_or_message";
const INGRESS = "https://api.decionis.example/v1/signals/webhooks/conn_kilo";
const REQUEST: IngressRequest = {
  events: [
    {
      type: "signal.crm",
      timestamp: "2026-09-24T10:00:00.000Z",
      data: { signal_id: "s1", batch_id: "b1", identifier: "CRM-DEMO-0001" },
    },
  ],
};

function respond(status: number, body = "") {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchClient: FetchClient, attempts = 3) {
  return new DecionisSignalIngressClient({
    url: INGRESS,
    webhookSecret: SECRET,
    timeoutMs: 50,
    attempts,
    backoffMs: 1,
    fetchClient,
    sleep: () => Promise.resolve(),
  });
}

describe("DecionisSignalIngressClient — the documented delivery posture", () => {
  it("posts the batch with the secret in the header and never in the URL", async () => {
    const fetchClient = vi.fn<FetchClient>().mockResolvedValue(respond(202));

    const ack = await client(fetchClient).send(REQUEST);

    expect(ack.status).toBe(202);
    const [url, init] = fetchClient.mock.calls[0]!;
    expect(String(url)).toBe(INGRESS);
    expect(String(url)).not.toContain(SECRET);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-webhook-secret"]).toBe(
      SECRET,
    );
    expect(JSON.parse(String(init?.body))).toEqual(REQUEST);
  });

  it("does not retry a 4xx, reports it as a gateway failure, and names the credentials without revealing them", async () => {
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(respond(401, '{"message":"bad secret"}'));

    const failure = await client(fetchClient)
      .send(REQUEST)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(StewardGatewayError);
    expect((failure as StewardGatewayError).status).toBe(502);
    expect((failure as Error).message).toMatch(/DECIONIS_WEBHOOK_SECRET/);
    expect((failure as Error).message).not.toContain(SECRET);
    expect(fetchClient).toHaveBeenCalledTimes(1);
  });

  it("passes the ingress's own reason through for a payload refusal", async () => {
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(
        respond(422, '{"message":"events[0].timestamp must be ISO-8601 UTC"}'),
      );

    await expect(client(fetchClient).send(REQUEST)).rejects.toThrow(
      /refused the batch \(422\): events\[0\].timestamp/,
    );
  });

  it("retries a 5xx with backoff and then reports the batch as not accepted, resendable", async () => {
    const fetchClient = vi
      .fn<FetchClient>()
      .mockImplementation(() => Promise.resolve(respond(503)));

    const failure = await client(fetchClient)
      .send(REQUEST)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(StewardUnavailableError);
    expect((failure as Error).message).toMatch(
      /after 3 attempts \(status 503\)/,
    );
    expect(fetchClient).toHaveBeenCalledTimes(3);
  });

  it("recovers when a retry succeeds", async () => {
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValueOnce(respond(500))
      .mockResolvedValueOnce(respond(200));

    await expect(client(fetchClient).send(REQUEST)).resolves.toEqual({
      status: 200,
    });
    expect(fetchClient).toHaveBeenCalledTimes(2);
  });

  it("treats a timeout like a 5xx: retried, then reported", async () => {
    const fetchClient: FetchClient = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    await expect(client(fetchClient, 2).send(REQUEST)).rejects.toThrow(
      /after 2 attempts \(timeout after 50ms\)/,
    );
  });
});
