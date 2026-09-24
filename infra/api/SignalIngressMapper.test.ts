/**
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SignalBatch } from "@/domain/signals/CapturedSignal";
import { IngressRequestSchema } from "@/domain/signals/SignalIngress";
import { toIngressRequest } from "./SignalIngressMapper";

/**
 * The outbound contract pin: what Steward sends to the Protocol's signal
 * ingress for a known batch, byte for byte. `samples/SignalIngressRequest.json`
 * is the body an operator sees in the mapping session; when the Protocol
 * documents a field Steward should carry differently, this is the file that
 * changes, and the test says so.
 */
const BATCH: SignalBatch = {
  batchId: "batch-sierra-20260924-1",
  sourceId: "src-demo-support",
  collectedAt: "2026-09-24T09:00:00.000Z",
  signals: [
    {
      id: "support-demo-0002-spike",
      sourceId: "src-demo-support",
      sourceRecordId: "support-sierra-20260924",
      accountReference: "CRM-DEMO-0002",
      observedAt: "2026-09-24T08:42:00.000Z",
      capturedAt: "2026-09-24T09:00:00.000Z",
      category: "SUPPORT",
      contextClass: "FRICTION",
      title: "Support contacts up 3.4x on one corridor",
      detail:
        "Ticket volume concentrated on US to MX, with settlement delay as the dominant reason code.",
      confidence: 0.94,
    },
    {
      id: "doc-demo-0002-kyb",
      sourceId: "src-demo-support",
      sourceRecordId: "upload-sierra-kyb-refresh",
      accountReference: "CRM-DEMO-0002",
      observedAt: "2026-09-23T16:10:00.000Z",
      capturedAt: "2026-09-24T09:00:00.000Z",
      category: "DOCUMENT",
      title: "KYB refresh letter received",
      detail:
        "The refreshed beneficial-ownership declaration was uploaded by the account owner.",
      confidence: 0.7,
    },
  ],
};

const SAMPLE = readFileSync(
  new URL("./samples/SignalIngressRequest.json", import.meta.url),
  "utf8",
);

describe("Signal ingress contract — what Steward sends", () => {
  it("matches the pinned request body exactly", () => {
    expect(toIngressRequest(BATCH)).toEqual(JSON.parse(SAMPLE));
  });

  it("is valid against the ingress's inbound contract: type, ISO timestamp, data object", () => {
    expect(() => IngressRequestSchema.parse(JSON.parse(SAMPLE))).not.toThrow();
  });

  it("types each event by its category and stamps it with the observation time", () => {
    const [support, document] = toIngressRequest(BATCH).events;
    expect(support?.type).toBe("signal.support");
    expect(support?.timestamp).toBe("2026-09-24T08:42:00.000Z");
    expect(document?.type).toBe("signal.document");
  });

  it("omits the context class when the connector did not assign one", () => {
    const [, document] = toIngressRequest(BATCH).events;
    expect(document?.data).not.toHaveProperty("context_class");
  });

  it("carries the identifiers a safe replay needs", () => {
    for (const event of toIngressRequest(BATCH).events) {
      expect(event.data.signal_id).toBeTruthy();
      expect(event.data.batch_id).toBe(BATCH.batchId);
    }
  });

  it("refuses an empty batch: the ingress requires at least one event", () => {
    expect(() => toIngressRequest({ ...BATCH, signals: [] })).toThrow();
  });

  it("sample provenance: demo references only, no email, phone or URL", () => {
    expect(SAMPLE).toMatch(/CRM-DEMO-\d{4}/);
    expect(SAMPLE).not.toMatch(/https?:\/\//);
    expect(SAMPLE).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(SAMPLE).not.toMatch(/\+\d[\d\s().-]{7,}/);
  });
});
