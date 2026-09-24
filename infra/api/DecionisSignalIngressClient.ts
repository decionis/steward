import type { IngressRequest } from "@/domain/signals/SignalIngress";
import {
  StewardGatewayError,
  StewardUnavailableError,
} from "@/infra/errors/StewardErrors";
import type { FetchClient } from "./JsonHttpClient";

export interface SignalIngressClientOptions {
  url: string;
  webhookSecret: string;
  timeoutMs: number;
  /** Total attempts for a 5xx or a timeout; a 4xx is never retried. */
  attempts?: number;
  backoffMs?: number;
  fetchClient?: FetchClient;
  sleep?: (ms: number) => Promise<void>;
}

export interface IngressAcknowledgement {
  status: number;
}

/**
 * The client for the Protocol's signal ingress. The delivery posture is the
 * documented one (https://decionis.com/docs/webhooks, "Retries"): a 2xx is
 * accepted; a 4xx means the payload or the credentials are wrong, so it is
 * reported and not retried; a 5xx or a timeout is retried with backoff, which
 * is safe because every event carries its identifiers. The secret travels in
 * the `x-webhook-secret` header, never in the URL, and never in an error.
 */
export class DecionisSignalIngressClient {
  private readonly url: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly backoffMs: number;
  private readonly fetchClient: FetchClient;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: SignalIngressClientOptions) {
    this.url = options.url;
    this.webhookSecret = options.webhookSecret;
    this.timeoutMs = options.timeoutMs;
    this.attempts = Math.max(1, options.attempts ?? 3);
    this.backoffMs = options.backoffMs ?? 500;
    this.fetchClient = options.fetchClient ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async send(request: IngressRequest): Promise<IngressAcknowledgement> {
    let lastFailure = "no response";
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      if (attempt > 1) await this.sleep(this.backoffMs * (attempt - 1));
      const outcome = await this.attempt(request);
      if (outcome.kind === "accepted") return { status: outcome.status };
      if (outcome.kind === "refused") {
        throw new StewardGatewayError(this.refusal(outcome), 502, outcome.body);
      }
      lastFailure = outcome.reason;
    }
    throw new StewardUnavailableError(
      `The Decionis signal ingress did not accept the batch after ${this.attempts} attempts (${lastFailure}); nothing was stored, and the batch can be sent again`,
    );
  }

  private async attempt(
    request: IngressRequest,
  ): Promise<
    | { kind: "accepted"; status: number }
    | { kind: "refused"; status: number; body: unknown }
    | { kind: "failed"; reason: string }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchClient(this.url, {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-webhook-secret": this.webhookSecret,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (response.ok) return { kind: "accepted", status: response.status };
      if (response.status >= 400 && response.status < 500) {
        const body = await this.parseBody(response);
        return { kind: "refused", status: response.status, body };
      }
      return { kind: "failed", reason: `status ${response.status}` };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError"
          ? `timeout after ${this.timeoutMs}ms`
          : "network error";
      return { kind: "failed", reason };
    } finally {
      clearTimeout(timeout);
    }
  }

  private refusal(outcome: { status: number; body: unknown }): string {
    if (outcome.status === 401 || outcome.status === 403) {
      return `The Decionis signal ingress refused the credential (${outcome.status}): check DECIONIS_CONNECTOR_ID and DECIONIS_WEBHOOK_SECRET against the deployment bundle`;
    }
    const detail =
      outcome.body &&
      typeof outcome.body === "object" &&
      "message" in outcome.body
        ? String((outcome.body as { message: unknown }).message)
        : "the payload was not accepted";
    return `The Decionis signal ingress refused the batch (${outcome.status}): ${detail}`;
  }

  private async parseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { message: text };
    }
  }
}
