import { RequestSchema } from "@/domain/PreviewContracts";
import { AzureModelClient } from "./AzureModelClient";
import { PreviewAgent } from "./PreviewAgent";
import { PreviewError } from "./ModelClient";
import { PreviewLimits } from "./PreviewLimits";

export class PreviewApi {
  static async body(request: Request): Promise<unknown> {
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new PreviewError("JSON_REQUIRED", 415);
    const url = new URL(request.url);
    // Next can normalize the internal URL to localhost. Host preserves the
    // browser's destination, including the public deployment alias.
    const host = request.headers.get("host") ?? url.host;
    if (request.headers.get("origin") !== `${url.protocol}//${host}`)
      throw new PreviewError("ORIGIN_REQUIRED", 403);
    const reader = request.body?.getReader();
    if (!reader) throw new PreviewError("INVALID_REQUEST", 400);
    const parts: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new PreviewError("REQUEST_TOO_LARGE", 413);
      }
      parts.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch {
      throw new PreviewError("INVALID_REQUEST", 400);
    }
  }

  static async post(request: Request): Promise<Response> {
    let release: (() => void) | undefined;
    try {
      const parsed = RequestSchema.safeParse(await this.body(request));
      if (!parsed.success) throw new PreviewError("INVALID_REQUEST", 400);
      if (parsed.data.mode === "journey" && !parsed.data.consent)
        throw new PreviewError("CONSENT_REQUIRED", 400);
      if (parsed.data.mode !== "discover" && !parsed.data.merchantId)
        throw new PreviewError("MERCHANT_REQUIRED", 400);
      const client = AzureModelClient.fromEnvironment();
      release = await PreviewLimits.admit(request);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(25_000),
      ]);
      const result = await new PreviewAgent(client).run(parsed.data, signal);
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const status = error instanceof PreviewError ? error.status : 503;
      const code =
        error instanceof PreviewError ? error.code : "PREVIEW_UNAVAILABLE";
      return Response.json(
        { error: code },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            ...(status === 429
              ? {
                  "Retry-After": "600",
                  "X-RateLimit-Limit": "20",
                  "X-RateLimit-Remaining": "0",
                }
              : {}),
            ...(status === 503 ? { "Retry-After": "15" } : {}),
          },
        },
      );
    } finally {
      release?.();
    }
  }
}
