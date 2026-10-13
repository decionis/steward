import { z } from "zod";
import { PreviewCatalog } from "@/domain/PreviewCatalog";
import { ResultSchema } from "@/domain/PreviewContracts";
import { PreviewExport } from "@/domain/PreviewExport";
import { PreviewError } from "./ModelClient";

const ExportSchema = z
  .object({
    merchantId: z.enum(["juniper", "form-field"]),
    format: z.enum(["square", "portrait", "text"]),
    result: ResultSchema,
  })
  .strict();

/** Stateless file rendering: no model request, storage or merchant action. */
export class PreviewExportApi {
  static async post(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const host = request.headers.get("host") ?? url.host;
      if (request.headers.get("origin") !== `${url.protocol}//${host}`)
        throw new PreviewError("ORIGIN_REQUIRED", 403);
      if (
        request.headers.get("content-type")?.split(";")[0] !==
        "application/x-www-form-urlencoded"
      )
        throw new PreviewError("FORM_REQUIRED", 415);
      const reader = request.body?.getReader();
      if (!reader) throw new PreviewError("INVALID_EXPORT", 400);
      const parts: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65_536) {
          await reader.cancel();
          throw new PreviewError("REQUEST_TOO_LARGE", 413);
        }
        parts.push(value);
      }
      const form = new URLSearchParams(Buffer.concat(parts).toString("utf8"));
      if (Array.from(form.keys()).length !== 3)
        throw new PreviewError("INVALID_EXPORT", 400);
      let result: unknown;
      try {
        result = JSON.parse(form.get("result") ?? "");
      } catch {
        throw new PreviewError("INVALID_EXPORT", 400);
      }
      const parsed = ExportSchema.safeParse({
        ...Object.fromEntries(form),
        result,
      });
      if (!parsed.success) throw new PreviewError("INVALID_EXPORT", 400);
      const { merchantId, format } = parsed.data;
      const merchant = PreviewCatalog.merchant(merchantId);
      const text = format === "text";
      const body = text
        ? PreviewExport.contentPack(parsed.data.result, merchant)
        : PreviewExport.graphic(
            parsed.data.result,
            merchant,
            format === "portrait",
          );
      const name = text
        ? `${merchantId}-content-pack.txt`
        : `${merchantId}-${format}-concept.svg`;
      return new Response(body, {
        headers: {
          "Content-Type": text
            ? "text/plain; charset=utf-8"
            : "image/svg+xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof PreviewError ? error.code : "EXPORT_UNAVAILABLE",
        },
        {
          status: error instanceof PreviewError ? error.status : 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  }
}
