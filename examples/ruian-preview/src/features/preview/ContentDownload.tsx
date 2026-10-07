import { Download } from "lucide-react";
import type { MerchantId } from "@/domain/PreviewCatalog";
import type { PreviewResult } from "@/domain/PreviewContracts";
import styles from "./Preview.module.css";

export function ContentDownload({
  merchantId,
  result,
  format,
}: {
  merchantId: MerchantId;
  result: PreviewResult;
  format: "square" | "portrait" | "text";
}) {
  const { headline, summary, productIds, sections, caption, callToAction } =
    result;
  return (
    <form action="/api/export" method="post" className={styles.downloadForm}>
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="format" value={format} />
      <input
        type="hidden"
        name="result"
        value={JSON.stringify({
          headline,
          summary,
          productIds,
          sections,
          caption,
          callToAction,
        })}
      />
      <button className={styles.secondaryButton} type="submit">
        <Download size={15} />
        {format === "text" ? "Download copy & script" : "Download graphic"}
      </button>
    </form>
  );
}
