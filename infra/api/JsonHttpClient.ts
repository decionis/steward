import type { ZodType } from "zod";
import { StewardGatewayError } from "@/infra/errors/StewardErrors";

export type FetchClient = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface JsonHttpClientOptions {
  baseUrl: string;
  bearerToken: string;
  /**
   * Sent as `x-decionis-org-id` when present. The published Protocol scopes by
   * `org_id` in the query or body instead, so its client leaves this out.
   */
  orgId?: string;
  timeoutMs: number;
  fetchClient?: FetchClient;
}

/** Headers a single request adds: idempotency and correlation, never auth. */
export type RequestHeaders = Record<string, string>;

export class JsonHttpClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string;
  private readonly orgId: string | null;
  private readonly timeoutMs: number;
  private readonly fetchClient: FetchClient;

  constructor(options: JsonHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.bearerToken = options.bearerToken;
    this.orgId = options.orgId ?? null;
    this.timeoutMs = options.timeoutMs;
    this.fetchClient = options.fetchClient ?? fetch;
  }

  async get<T>(
    path: string,
    schema: ZodType<T>,
    headers: RequestHeaders = {},
  ): Promise<T> {
    return this.request(path, schema, { method: "GET" }, headers);
  }

  async post<T>(
    path: string,
    body: unknown,
    schema: ZodType<T>,
    headers: RequestHeaders = {},
  ): Promise<T> {
    return this.request(
      path,
      schema,
      { method: "POST", body: JSON.stringify(body) },
      headers,
    );
  }

  private async request<T>(
    path: string,
    schema: ZodType<T>,
    init: RequestInit,
    extraHeaders: RequestHeaders,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchClient(`${this.baseUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          ...extraHeaders,
          authorization: `Bearer ${this.bearerToken}`,
          "content-type": "application/json",
          ...(this.orgId ? { "x-decionis-org-id": this.orgId } : {}),
        },
        signal: controller.signal,
      });
      const body = await this.parseBody(response);
      if (!response.ok) {
        throw new StewardGatewayError(
          this.readErrorMessage(body, response.statusText),
          response.status,
          body,
        );
      }
      return schema.parse(body);
    } finally {
      clearTimeout(timeout);
    }
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

  private readErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object") {
      // The Protocol's ErrorResponse carries `error` always and `message`
      // sometimes; prefer the sentence, fall back to the code.
      const { message, error } = body as { message?: unknown; error?: unknown };
      if (typeof message === "string" && message) return message;
      if (typeof error === "string" && error) return error;
    }
    return fallback || "Decionis Steward request failed";
  }
}
