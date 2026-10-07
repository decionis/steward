/**
 * @vitest-environment node
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { StewardGatewayError } from "@/infra/errors/StewardErrors";
import type { DecionisWorkspaceConfig } from "@/infra/config/StewardRuntimeConfig";
import { DecionisProtocolClient } from "./DecionisProtocolClient";
import type { FetchClient } from "./JsonHttpClient";

/**
 * The published-Protocol pin. Every sample in `samples/protocol/` is served
 * by a fake origin and driven through the real `DecionisProtocolClient`, the
 * real `JsonHttpClient` and the contracts in `domain/protocol/`, so what is
 * asserted is the whole path from bytes on the wire to a typed value.
 */
const ORG = "0f5c7a2e-4b1d-4c3e-9a8f-2d6e1b7c9a01";
const API_KEY = "dcy_org_never_in_a_url";
const workspace: DecionisWorkspaceConfig = {
  baseUrl: "https://api.decionis.example",
  apiKey: API_KEY,
  orgId: ORG,
  workspaceName: "Zulu Financial",
};

function sample<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`./samples/protocol/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as T;
}

const ROUTES: Record<
  string,
  { method: string; sample: string; status?: number }
> = {
  "/v1/health": { method: "GET", sample: "HealthResponse" },
  "/v1/protocol/evaluate-decision": {
    method: "POST",
    sample: "EvaluateDecisionResponse",
  },
  "/v1/protocol/dossiers/7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e50": {
    method: "GET",
    sample: "DecisionDossierResponse",
  },
  "/v1/protocol/decision-chains/2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c93": {
    method: "GET",
    sample: "DecisionChainResponse",
  },
  "/v1/protocol/decision-chains/by-evaluation/3b8f1e2a-6c4d-4e7f-8a9b-1c2d3e4f5a60":
    {
      method: "GET",
      sample: "DecisionChainResponse",
    },
  "/v1/protocol/shadow/evaluate-decision/reports": {
    method: "GET",
    sample: "ShadowReportsResponse",
  },
  "/v1/protocol/shadow/evaluate-decision/reports/summary": {
    method: "GET",
    sample: "ShadowReportsSummaryResponse",
  },
  "/v1/protocol/signals/envelopes": {
    method: "POST",
    sample: "SignalEnvelopeAccepted",
    status: 202,
  },
  "/v1/protocol/surfaces/decisions": {
    method: "POST",
    sample: "SurfaceDecisionResponse",
  },
};

interface Call {
  url: URL;
  init: RequestInit;
}

/** A client whose origin serves the samples, with optional per-path bodies. */
function serving(
  overrides: Record<string, { status: number; body: unknown }> = {},
) {
  const calls: Call[] = [];
  const fetchClient: FetchClient = (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const override = overrides[url.pathname];
    if (override) {
      return Promise.resolve(
        new Response(JSON.stringify(override.body), {
          status: override.status,
        }),
      );
    }
    const route = ROUTES[url.pathname];
    if (!route || route.method !== init.method) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(sample(route.sample)), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const client = new DecionisProtocolClient({
    workspace,
    timeoutMs: 8_000,
    fetchClient,
  });
  return { client, calls };
}

const ENVELOPE = {
  protocol_version: "1.1",
  envelope_id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  source: {
    provider: "steward",
    connector_id: "src-demo-crm",
    mode: "CUSTOMER_INFRA" as const,
  },
  domain: "crm",
  metric_name: "account_milestone",
  metric_type: "event" as const,
  value: "Expansion milestone recorded",
  recorded_at: "2026-09-25T08:44:00.000Z",
  ingested_at: "2026-09-25T09:13:39.000Z",
  dimensions: {
    account_reference: "CRM-DEMO-0001",
    source_record: "crm-kilo-20260924",
  },
};

describe("Protocol contract — each published sample parses through the client", () => {
  it("health", async () => {
    await expect(serving().client.health()).resolves.toEqual({
      status: "ok",
      version: "0.5.0",
    });
  });

  it("evaluate-decision: a protocol 1.1 shadow escalation, with its snapshot, chain and reason codes", async () => {
    const response = await serving().client.evaluateDecision(
      {
        decision_type: "PROCESSING_LIMIT_REVIEW",
        mode: "SHADOW",
        risk_score: 0.21,
        context: { identifier: "CRM-DEMO-0001" },
      },
      { idempotencyKey: "kilo-limit-review-20260925" },
    );

    expect(response.outcome).toBe("ESCALATE");
    expect(response.verdict).toBe("ESCALATE");
    expect(response.mode).toBe("SHADOW");
    expect(response.execution_eligible).toBe(false);
    expect(response.policy_snapshot?.policy_version).toBe("customer_ops.v4");
    expect(response.decision_chain?.chain_id).toBe(
      "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c93",
    );
    expect(response.reason_codes).toContain("POLICY_ACTION_REQUIRE_REVIEW");
  });

  it("dossier: the record behind a decision, with the signals it accepted", async () => {
    const response = await serving().client.getDossier(
      "7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e50",
    );

    expect(response.dossier.decision_evaluation_id).toBe(
      "3b8f1e2a-6c4d-4e7f-8a9b-1c2d3e4f5a60",
    );
    expect(response.dossier.dossier_payload.signal_context).toHaveLength(2);
  });

  it("decision chain, by id and by evaluation", async () => {
    const { client } = serving();
    const byId = await client.getDecisionChain(
      "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c93",
    );
    const byEvaluation = await client.getDecisionChainByEvaluation(
      "3b8f1e2a-6c4d-4e7f-8a9b-1c2d3e4f5a60",
    );

    expect(byId.links.map((link) => link.outcome)).toEqual([
      "APPROVE",
      "ESCALATE",
    ]);
    expect(byEvaluation).toEqual(byId);
    expect(byId.evidence_lineage).toEqual([]);
  });

  it("shadow reports and their summary", async () => {
    const { client } = serving();
    const reports = await client.listShadowReports({
      mode: "SHADOW",
      limit: 50,
    });
    const summary = await client.summarizeShadowReports();

    expect(reports.reports.map((report) => report.decision_type)).toEqual([
      "PROCESSING_LIMIT_REVIEW",
      "FRICTION_INTERVENTION",
      "NO_ACTION",
    ]);
    expect(reports.count).toBe(reports.reports.length);
    expect(summary.summary.total_evaluations).toBe(3);
  });

  it("signal envelope: accepted with an artifact id", async () => {
    const accepted = await serving().client.ingestSignalEnvelope(ENVELOPE, {
      idempotencyKey: "env-9a8b7c6d",
    });

    expect(accepted).toMatchObject({
      accepted: true,
      artifact: "signal_envelope",
    });
    expect(accepted.artifact_id).toBe("env-kilo-0001");
  });

  it("surface decision: federated into the ledger", async () => {
    const response = await serving().client.federateSurfaceDecision({
      surface: "steward",
      decision: "review",
      dossier_id: "7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e50",
      dossier_sha256: "kilo-dossier-digest",
      mode: "shadow",
    });

    expect(response.federated).toBe(true);
    expect(response.ledger_entry_id).toBeTruthy();
  });
});

describe("Protocol contract — what Steward puts on the wire", () => {
  it("authenticates with the org key in the header only, never in a URL, and sends no private org header", async () => {
    const { client, calls } = serving();
    await client.health();
    await client.getDossier("7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e50");

    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>;
      expect(headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(headers).not.toHaveProperty("x-decionis-org-id");
      expect(call.url.toString()).not.toContain(API_KEY);
    }
  });

  it("scopes every read to the configured organisation", async () => {
    const { client, calls } = serving();
    await client.getDossier("7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e50");
    await client.listShadowReports({
      mode: "SHADOW",
      limit: 10,
      since: "2026-09-18T00:00:00.000Z",
    });

    expect(calls.map((call) => call.url.searchParams.get("org_id"))).toEqual([
      ORG,
      ORG,
    ]);
    expect(calls[1]!.url.searchParams.get("mode")).toBe("SHADOW");
    expect(calls[1]!.url.searchParams.get("limit")).toBe("10");
  });

  it("scopes every write to the configured organisation, whatever the caller passes", async () => {
    const { client, calls } = serving();
    await client.evaluateDecision(
      {
        decision_type: "NO_ACTION",
        org_id: "11111111-1111-4111-8111-111111111111",
      } as never,
      { idempotencyKey: "k1" },
    );
    await client.ingestSignalEnvelope(
      { ...ENVELOPE, org_id: "someone-else" } as never,
      {
        idempotencyKey: "k2",
      },
    );

    for (const call of calls) {
      expect(JSON.parse(String(call.init.body)).org_id).toBe(ORG);
    }
  });

  it("sends an idempotency key, and a correlation id when given, on evaluate and envelope writes", async () => {
    const { client, calls } = serving();
    await client.evaluateDecision(
      { decision_type: "NO_ACTION" },
      { idempotencyKey: "eval-1", correlationId: "corr-1" },
    );
    await client.ingestSignalEnvelope(ENVELOPE, { idempotencyKey: "env-1" });

    const [evaluate, envelope] = calls.map(
      (call) => call.init.headers as Record<string, string>,
    );
    expect(evaluate!["Idempotency-Key"]).toBe("eval-1");
    expect(evaluate!["X-Correlation-ID"]).toBe("corr-1");
    expect(envelope!["Idempotency-Key"]).toBe("env-1");
    expect(envelope).not.toHaveProperty("X-Correlation-ID");
  });

  it("refuses a write without an idempotency key, before anything is sent", async () => {
    const { client, calls } = serving();
    await expect(
      client.evaluateDecision(
        { decision_type: "NO_ACTION" },
        { idempotencyKey: "" },
      ),
    ).rejects.toThrow(/idempotency key/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a malformed request before anything is sent", async () => {
    const { client, calls } = serving();
    await expect(
      client.evaluateDecision(
        { decision_type: "NO_ACTION", risk_score: 1.5 },
        { idempotencyKey: "k" },
      ),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      client.ingestSignalEnvelope(
        {
          ...ENVELOPE,
          semantic: { schema_version: "1.0", kind: "Not A Kind" },
        } as never,
        { idempotencyKey: "k" },
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(calls).toHaveLength(0);
  });
});

describe("Protocol contract — what a platform mistake looks like at the boundary", () => {
  it("a protocol 1.1 response without its verdict fails", async () => {
    const body = sample("EvaluateDecisionResponse");
    delete body.verdict;
    const { client } = serving({
      "/v1/protocol/evaluate-decision": { status: 200, body },
    });

    const failure = await client
      .evaluateDecision({ decision_type: "NO_ACTION" }, { idempotencyKey: "k" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ZodError);
    expect((failure as ZodError).issues[0]?.message).toMatch(
      /verdict is required/,
    );
  });

  it("a response before protocol 1.1 parses without the 1.1 fields", async () => {
    const body = sample("EvaluateDecisionResponse");
    for (const key of [
      "protocol_version",
      "verdict",
      "authority_classification",
      "execution_eligible",
      "policy_reference",
      "evaluation_semantics",
      "input_snapshot_digest",
      "execution_binding_digest",
    ]) {
      delete body[key];
    }
    const { client } = serving({
      "/v1/protocol/evaluate-decision": { status: 200, body },
    });

    const response = await client.evaluateDecision(
      { decision_type: "NO_ACTION" },
      { idempotencyKey: "k" },
    );
    expect(response.verdict).toBeUndefined();
    expect(response.outcome).toBe("ESCALATE");
  });

  it("an outcome outside the published four fails", async () => {
    const body = { ...sample("EvaluateDecisionResponse"), outcome: "ALLOW" };
    const { client } = serving({
      "/v1/protocol/evaluate-decision": { status: 200, body },
    });

    await expect(
      client.evaluateDecision(
        { decision_type: "NO_ACTION" },
        { idempotencyKey: "k" },
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("a digest that is not sha256 fails the chain", async () => {
    const body = sample<{ evidence_lineage: unknown[] }>(
      "DecisionChainResponse",
    );
    body.evidence_lineage = [
      {
        stage: "CLAIM",
        evaluation_id: "3b8f1e2a-6c4d-4e7f-8a9b-1c2d3e4f5a60",
        dossier_id: "7c1d2e3f-4a5b-4c6d-9e8f-0a1b2c3d4e50",
        status: "CLAIMED",
        occurred_at: "2026-09-25T09:20:00.000Z",
        ledger_entry_id: "4c5d6e7f-8a9b-4c0d-8e1f-2a3b4c5d6ea4",
        ledger_entry_hash: "a".repeat(64),
        evidence_digest: "md5:abc",
        evidence_hash_verified: true,
        execution_correlation_id: "corr",
        binding_digest: null,
        observed_at: null,
        observation_method: null,
        observer: null,
        expected_effect_digest: null,
        observed_effect_digest: null,
        evidence_reference: null,
      },
    ];
    const { client } = serving({
      "/v1/protocol/decision-chains/2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c93": {
        status: 200,
        body,
      },
    });

    await expect(
      client.getDecisionChain("2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c93"),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("the Protocol's structured error arrives as a gateway error with its message or its code", async () => {
    const { client } = serving({
      "/v1/health": {
        status: 401,
        body: { error: "invalid_credentials", status: 401 },
      },
      "/v1/protocol/shadow/evaluate-decision/reports": {
        status: 400,
        body: {
          error: "bad_request",
          message: "since must be ISO-8601",
          request_id: "req-1",
        },
      },
    });

    const unauthorised = await client.health().catch((error: unknown) => error);
    expect(unauthorised).toBeInstanceOf(StewardGatewayError);
    expect((unauthorised as StewardGatewayError).status).toBe(401);
    expect((unauthorised as Error).message).toBe("invalid_credentials");
    await expect(client.listShadowReports()).rejects.toThrow(
      "since must be ISO-8601",
    );
  });
});

describe("Protocol contract — sample provenance", () => {
  const directory = new URL("./samples/protocol/", import.meta.url);
  const files = readdirSync(directory).filter((file) => file.endsWith(".json"));
  const serialized = files
    .map((file) => readFileSync(new URL(file, directory), "utf8"))
    .join("\n");

  it("covers every route the client serves", () => {
    const used = new Set(
      Object.values(ROUTES).map((route) => `${route.sample}.json`),
    );
    expect(new Set(files)).toEqual(used);
  });

  it("references accounts the demo way and carries no email, phone number or URL", () => {
    expect(serialized).toMatch(/CRM-DEMO-\d{4}/);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/\+\d[\d\s().-]{7,}/);
  });

  it("uses one organisation throughout", () => {
    const orgIds = new Set(serialized.match(/"org_id": "[^"]+"/g));
    expect(orgIds).toEqual(new Set([`"org_id": "${ORG}"`]));
  });
});

vi.restoreAllMocks();
