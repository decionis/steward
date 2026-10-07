import type { PreviewMerchant } from "./PreviewCatalog";
import type { PreviewResult } from "./PreviewContracts";

export class PreviewExport {
  static escape(text: string): string {
    return text.replace(
      /[&<>"']/g,
      (value) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[value]!,
    );
  }
  static wrap(text: string, length: number): string[] {
    const lines: string[] = [];
    let current = "";
    let units = 0;
    for (const character of Array.from(text.trim().replace(/\s+/g, " "))) {
      const width = /[\u2e80-\uffef]/u.test(character) ? 2 : 1;
      if (units + width > length) {
        const space = current.lastIndexOf(" ");
        if (space > length / 2) {
          lines.push(current.slice(0, space));
          current = current.slice(space + 1);
          units = Array.from(current).reduce(
            (sum, value) => sum + (/[\u2e80-\uffef]/u.test(value) ? 2 : 1),
            0,
          );
        } else {
          lines.push(current.trim());
          current = "";
          units = 0;
        }
      }
      if (!current && character === " ") continue;
      current += character;
      units += width;
    }
    if (current) lines.push(current.trim());
    return lines;
  }
  static graphic(
    result: PreviewResult,
    merchant: PreviewMerchant,
    portrait = false,
  ): string {
    const height = portrait ? 600 : 480;
    let titleLines = this.wrap(result.headline, 25);
    const titleSize =
      titleLines.length > 3 ? 22 : titleLines.length > 2 ? 26 : 32;
    if (titleLines.length > 3) titleLines = this.wrap(result.headline, 32);
    let ctaLines = this.wrap(result.callToAction, 46);
    const ctaSize = ctaLines.length > 2 ? 11 : 14;
    if (ctaLines.length > 2) ctaLines = this.wrap(result.callToAction, 64);
    const illustration =
      merchant.id === "juniper"
        ? `<path d="M169 122H293L283 201Q281 221 231 221Q181 221 178 202Z" fill="${merchant.color}"/><ellipse cx="231" cy="123" rx="62" ry="17" fill="#fffaf0"/><ellipse cx="231" cy="124" rx="49" ry="10" fill="${merchant.color}" opacity=".45"/><path d="M291 144Q342 132 327 177Q320 197 287 188" fill="none" stroke="${merchant.color}" stroke-width="10"/><path d="M215 97Q199 75 215 60M242 97Q225 75 243 58" stroke="#ffffff" stroke-width="4" fill="none"/>`
        : `<rect x="167" y="95" width="137" height="139" rx="8" fill="${merchant.color}" transform="rotate(-8 235 165)"/><rect x="178" y="100" width="121" height="130" rx="3" fill="#fffaf0" transform="rotate(-8 235 165)"/><path d="M200 131L267 122M204 154L271 145M207 177L274 168M210 199L253 193" stroke="${merchant.color}" stroke-width="2" opacity=".3"/><path d="M293 83L270 190L282 177L303 85Z" fill="${merchant.color}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${height}" viewBox="0 0 480 ${height}"><rect width="480" height="${height}" fill="${merchant.accent}"/><circle cx="388" cy="86" r="190" fill="${merchant.color}" opacity=".07"/><circle cx="82" cy="204" r="105" fill="${merchant.color}" opacity=".06"/><text x="36" y="49" font-family="Arial,sans-serif" font-size="18" fill="${merchant.color}">${this.escape(merchant.name)}</text>${illustration}<rect x="24" y="${height - 222}" width="432" height="198" rx="4" fill="#fffdf8"/>${titleLines.map((text, index) => `<text x="46" y="${height - 169 + index * (titleSize + 5)}" font-family="Arial,sans-serif" font-weight="bold" font-size="${titleSize}" fill="${merchant.color}">${this.escape(text)}</text>`).join("")}${ctaLines.map((text, index) => `<text x="46" y="${height - 90 + index * 16}" font-family="Arial,sans-serif" font-size="${ctaSize}" fill="${merchant.color}">${this.escape(text)}</text>`).join("")}<text x="46" y="${height - 42}" font-family="Arial,sans-serif" font-size="9" letter-spacing="1.6" fill="#7c8174">CONCEPT CONTENT / SAMPLE MERCHANT</text></svg>`;
  }
  static contentPack(result: PreviewResult, merchant: PreviewMerchant): string {
    return `${merchant.name} - sample content pack\nAI draft for merchant review. Nothing published.\n\n${result.headline}\n${result.summary}\n\nSOCIAL CAPTION\n${result.caption}\n\nCALL TO ACTION\n${result.callToAction}\n\nSHORT-VIDEO SCRIPT\n${result.sections.map((section) => `${section.title}\n${section.body}`).join("\n\n")}\n`;
  }
}
