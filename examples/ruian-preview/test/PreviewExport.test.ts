import { describe, expect, it } from "vitest";
import { PreviewExport } from "@/domain/PreviewExport";
import { MERCHANTS } from "@/domain/PreviewCatalog";

describe("PreviewExport", () => {
  it("wraps the complete call to action instead of cutting off the last word", () => {
    const callToAction =
      "Consider a notebook for your next colleague thank-you.";
    const svg = PreviewExport.graphic(
      {
        headline: "A small gift for everyday ideas",
        summary: "Sample",
        productIds: [],
        sections: [],
        caption: "Sample",
        callToAction,
      },
      MERCHANTS[1]!,
    );
    const text = Array.from(
      svg.matchAll(/<text[^>]*>(.*?)<\/text>/g),
      (match) => match[1],
    ).join(" ");
    expect(text).toContain(callToAction);
  });
  it("escapes generated text instead of executing markup in downloaded graphics", () => {
    const svg = PreviewExport.graphic(
      {
        headline: '<script>alert("x")</script>',
        summary: "Sample",
        productIds: [],
        sections: [],
        caption: "Sample",
        callToAction: '<image href="https://attacker.example"/>',
      },
      MERCHANTS[0]!,
    );
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<image");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain('viewBox="0 0 480 480"');
  });
});
