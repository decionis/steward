/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from "vitest";
import type { SignalBatch } from "@/domain/signals/CapturedSignal";
import type { DecionisSignalIngressClient } from "@/infra/api/DecionisSignalIngressClient";
import { StewardUnavailableError } from "@/infra/errors/StewardErrors";
import { DecionisSignalRepository } from "./DecionisSignalRepository";

const batch: SignalBatch = {
  batchId: "b1",
  sourceId: "src-demo-crm",
  collectedAt: "2026-09-24T10:05:00.000Z",
  signals: [
    {
      id: "crm-demo-0001-milestone",
      sourceId: "src-demo-crm",
      sourceRecordId: "crm-kilo-20260924",
      accountReference: "CRM-DEMO-0001",
      observedAt: "2026-09-24T10:00:00.000Z",
      capturedAt: "2026-09-24T10:05:00.000Z",
      category: "CRM",
      title: "Expansion milestone recorded",
      detail: "Contracted volume commitment signed.",
      confidence: 0.9,
    },
  ],
};

function stubClient() {
  const send = vi.fn().mockResolvedValue({ status: 202 });
  return { client: { send } as unknown as DecionisSignalIngressClient, send };
}

describe("DecionisSignalRepository", () => {
  it("says the ingress is not configured rather than pretending, and never falls back to demo", async () => {
    await expect(
      new DecionisSignalRepository(null).forward(batch),
    ).rejects.toBeInstanceOf(StewardUnavailableError);
  });

  it("forwards a batch as ingress events and reports every event accepted on a 2xx", async () => {
    const { client, send } = stubClient();

    const result = await new DecionisSignalRepository(client).forward(batch);

    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0]![0] as {
      events: { type: string; data: Record<string, unknown> }[];
    };
    expect(request.events).toHaveLength(1);
    expect(request.events[0]?.type).toBe("signal.crm");
    expect(request.events[0]?.data.identifier).toBe("CRM-DEMO-0001");
    expect(result).toMatchObject({ batchId: "b1", accepted: 1, rejected: [] });
  });

  it("does not call the ingress for an empty collection; there is nothing to send", async () => {
    const { client, send } = stubClient();

    const result = await new DecionisSignalRepository(client).forward({
      ...batch,
      signals: [],
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.accepted).toBe(0);
  });
});
