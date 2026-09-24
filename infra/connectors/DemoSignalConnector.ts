import type { CapturedSignal } from "@/domain/signals/CapturedSignal";
import type { SignalSource } from "@/domain/signals/SignalSource";
import type { SignalConnector } from "./SignalConnector";

/**
 * Demo sources. Invented, like every other fixture: organisations named from
 * the NATO alphabet, references shaped CRM-DEMO-000n, targets that are labels
 * rather than hosts. Nothing here reaches the network; `collect` returns the
 * fixtures with timestamps relative to now, the way DemoStewardData does.
 */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

type Fixture = { source: SignalSource; signals: () => CapturedSignal[] };

const FIXTURES: Fixture[] = [
  {
    source: {
      id: "src-demo-crm",
      name: "CRM",
      kind: "CRM",
      target: "crm.demo (fixture)",
      categories: ["CRM"],
      health: "HEALTHY",
      enabled: true,
      lastCollectedAt: ago(10),
      signalsCollected: 12,
    },
    signals: () => [
      {
        id: "crm-demo-0001-milestone",
        sourceId: "src-demo-crm",
        sourceRecordId: "crm-kilo-20260924",
        accountReference: "CRM-DEMO-0001",
        observedAt: ago(30),
        capturedAt: ago(0),
        category: "CRM",
        contextClass: "JOURNEY",
        title: "Expansion milestone recorded",
        detail:
          "Contracted volume commitment for the second half of the year was signed and logged against the account.",
        confidence: 0.9,
      },
      {
        id: "crm-demo-0004-renewal",
        sourceId: "src-demo-crm",
        sourceRecordId: "crm-victor-20260924",
        accountReference: "CRM-DEMO-0004",
        observedAt: ago(95),
        capturedAt: ago(0),
        category: "CRM",
        contextClass: "JOURNEY",
        title: "Renewal conversation scheduled",
        detail: "The account owner booked the annual review for next month.",
        confidence: 0.85,
      },
    ],
  },
  {
    source: {
      id: "src-demo-support",
      name: "Support desk",
      kind: "SUPPORT_DESK",
      target: "support-desk.demo (fixture)",
      categories: ["SUPPORT"],
      health: "HEALTHY",
      enabled: true,
      lastCollectedAt: ago(18),
      signalsCollected: 41,
    },
    signals: () => [
      {
        id: "support-demo-0002-spike",
        sourceId: "src-demo-support",
        sourceRecordId: "support-sierra-20260924",
        accountReference: "CRM-DEMO-0002",
        observedAt: ago(18),
        capturedAt: ago(0),
        category: "SUPPORT",
        contextClass: "FRICTION",
        title: "Support contacts up 3.4x on one corridor",
        detail:
          "Ticket volume concentrated on US → MX, with settlement delay as the dominant reason code.",
        confidence: 0.94,
      },
    ],
  },
  {
    source: {
      id: "src-demo-ledger-mcp",
      name: "Settlement ledger",
      kind: "MCP",
      target: "settlement-ledger.demo (MCP server, fixture)",
      categories: ["TRANSACTION"],
      health: "DEGRADED",
      enabled: true,
      lastCollectedAt: ago(110),
      signalsCollected: 7,
    },
    signals: () => [
      {
        id: "ledger-demo-0002-completion",
        sourceId: "src-demo-ledger-mcp",
        sourceRecordId: "settle-sierra-20260924",
        accountReference: "CRM-DEMO-0002",
        observedAt: ago(110),
        capturedAt: ago(0),
        category: "TRANSACTION",
        contextClass: "OPERATIONAL",
        title: "Completion rate fell to 96.1%",
        detail:
          "Corridor completion dropped 2.7 points against baseline over four days.",
        confidence: 0.91,
      },
    ],
  },
  {
    source: {
      id: "src-demo-upload",
      name: "Document upload",
      kind: "FILE_UPLOAD",
      target: "This server",
      categories: ["DOCUMENT"],
      health: "DISCONNECTED",
      enabled: false,
      lastCollectedAt: null,
      signalsCollected: 0,
    },
    signals: () => [],
  },
];

export class DemoSignalConnector implements SignalConnector {
  constructor(private readonly fixture: Fixture) {}

  get source(): SignalSource {
    return { ...this.fixture.source };
  }

  async collect(): Promise<CapturedSignal[]> {
    return this.fixture.signals();
  }

  static all(): DemoSignalConnector[] {
    return FIXTURES.map((fixture) => new DemoSignalConnector(fixture));
  }
}
