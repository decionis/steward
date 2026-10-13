import { describe, expect, it } from "vitest";
import { PreviewExportApi } from "@/server/PreviewExportApi";

const result = {
  headline: '<script>alert("x")</script>',
  summary: "Sample content for review.",
  productIds: [],
  sections: [{ title: "Opening", body: "Show the notebook." }],
  caption: "A thoughtful gift.",
  callToAction: "Consider a notebook for your next colleague thank-you.",
};
function request(
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  return new Request("https://preview.example/api/export", {
    method: "POST",
    headers: { Origin: "https://preview.example", ...headers },
    body: new URLSearchParams({
      merchantId: "form-field",
      format: "text",
      result: JSON.stringify(result),
      ...fields,
    }),
  });
}

describe("PreviewExportApi", () => {
  it("delivers an uncached text attachment containing the complete draft", async () => {
    const response = await PreviewExportApi.post(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="form-field-content-pack.txt"',
    );
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.text();
    expect(body).toContain(result.callToAction);
    expect(body).toContain("Opening\nShow the notebook.");
  });

  it.each([
    ["square", 480],
    ["portrait", 600],
  ])(
    "renders the %s attachment with escaped model text",
    async (format, height) => {
      const response = await PreviewExportApi.post(
        request({ format: String(format) }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="form-field-${format}-concept.svg"`,
      );
      expect(response.headers.get("content-type")).toBe(
        "image/svg+xml; charset=utf-8",
      );
      const body = await response.text();
      expect(body).toContain(`viewBox="0 0 480 ${height}"`);
      expect(body).not.toContain("<script>");
      expect(body).toContain("&lt;script&gt;");
    },
  );

  it.each([
    [403, { Origin: "https://unrelated.example" }],
    [415, { "Content-Type": "application/json" }],
  ])(
    "rejects cross-origin or unsupported input with %i",
    async (status, headers) => {
      const response = await PreviewExportApi.post(
        request({}, headers as Record<string, string>),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  const invalidExports: Record<string, string>[] = [
    { merchantId: "../../private" },
    { format: "html" },
    { result: "{" },
    { result: JSON.stringify({ ...result, caption: "x".repeat(701) }) },
    { filename: "custom.svg" },
  ];
  it.each(invalidExports)("rejects invalid export fields", async (fields) => {
    expect((await PreviewExportApi.post(request(fields))).status).toBe(400);
  });

  it("bounds the body before parsing or rendering it", async () => {
    expect(
      (await PreviewExportApi.post(request({ result: "x".repeat(65_537) })))
        .status,
    ).toBe(413);
  });
});
