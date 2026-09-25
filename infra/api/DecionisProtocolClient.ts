import {
  DecisionChainResponseSchema,
  type DecisionChainResponse,
} from "@/domain/protocol/DecisionChain";
import {
  DecisionDossierResponseSchema,
  type DecisionDossierResponse,
} from "@/domain/protocol/DecisionDossier";
import {
  EvaluateDecisionRequestSchema,
  EvaluateDecisionResponseSchema,
  type EvaluateDecisionRequest,
  type EvaluateDecisionResponse,
} from "@/domain/protocol/DecisionEvaluation";
import {
  ProtocolHealthResponseSchema,
  type ProtocolHealthResponse,
} from "@/domain/protocol/ProtocolHealth";
import {
  ShadowReportsResponseSchema,
  ShadowReportsSummaryResponseSchema,
  type ShadowReportQuery,
  type ShadowReportsResponse,
  type ShadowReportsSummaryResponse,
} from "@/domain/protocol/ShadowReports";
import {
  ArtifactAcceptedResponseSchema,
  SignalEnvelopeSchema,
  type ArtifactAcceptedResponse,
  type SignalEnvelope,
} from "@/domain/protocol/SignalEnvelope";
import {
  SurfaceDecisionRequestSchema,
  SurfaceDecisionResponseSchema,
  type SurfaceDecisionRequest,
  type SurfaceDecisionResponse,
} from "@/domain/protocol/SurfaceDecision";
import type { DecionisWorkspaceConfig } from "@/infra/config/StewardRuntimeConfig";
import {
  JsonHttpClient,
  type FetchClient,
  type RequestHeaders,
} from "./JsonHttpClient";

/** Every write carries an idempotency key, so a retry after doubt is safe. */
export interface WriteOptions {
  idempotencyKey: string;
  correlationId?: string;
}

export interface DecionisProtocolClientOptions {
  workspace: DecionisWorkspaceConfig;
  timeoutMs: number;
  fetchClient?: FetchClient;
}

/**
 * The client for the published Decionis Protocol
 * (https://docs.decionis.com/, OpenAPI at
 * https://decionis.com/.well-known/openapi.json). Steward is a third-party
 * application on it: one method per published operation Steward uses, each
 * request parsed before it leaves and each response parsed before it enters,
 * through the contracts in `domain/protocol/`. Authentication is the
 * organisation's API key as a bearer token; the organisation scope is always
 * the configured one, never a caller's choice. Nothing here decides anything.
 */
export class DecionisProtocolClient {
  private readonly http: JsonHttpClient;
  private readonly orgId: string;

  constructor(options: DecionisProtocolClientOptions) {
    this.orgId = options.workspace.orgId;
    this.http = new JsonHttpClient({
      baseUrl: options.workspace.baseUrl,
      bearerToken: options.workspace.apiKey,
      timeoutMs: options.timeoutMs,
      fetchClient: options.fetchClient,
    });
  }

  health(): Promise<ProtocolHealthResponse> {
    return this.http.get("/v1/health", ProtocolHealthResponseSchema);
  }

  async evaluateDecision(
    request: Omit<EvaluateDecisionRequest, "org_id" | "idempotency_key">,
    write: WriteOptions,
  ): Promise<EvaluateDecisionResponse> {
    const body = EvaluateDecisionRequestSchema.parse({
      ...request,
      org_id: this.orgId,
    });
    return await this.http.post(
      "/v1/protocol/evaluate-decision",
      body,
      EvaluateDecisionResponseSchema,
      writeHeaders(write),
    );
  }

  getDossier(dossierId: string): Promise<DecisionDossierResponse> {
    return this.http.get(
      `/v1/protocol/dossiers/${encodeURIComponent(dossierId)}${this.scope()}`,
      DecisionDossierResponseSchema,
    );
  }

  getDecisionChain(chainId: string): Promise<DecisionChainResponse> {
    return this.http.get(
      `/v1/protocol/decision-chains/${encodeURIComponent(chainId)}${this.scope()}`,
      DecisionChainResponseSchema,
    );
  }

  getDecisionChainByEvaluation(
    evaluationId: string,
  ): Promise<DecisionChainResponse> {
    return this.http.get(
      `/v1/protocol/decision-chains/by-evaluation/${encodeURIComponent(evaluationId)}${this.scope()}`,
      DecisionChainResponseSchema,
    );
  }

  listShadowReports(
    query: ShadowReportQuery = {},
  ): Promise<ShadowReportsResponse> {
    return this.http.get(
      `/v1/protocol/shadow/evaluate-decision/reports${this.scope(query)}`,
      ShadowReportsResponseSchema,
    );
  }

  summarizeShadowReports(
    query: ShadowReportQuery = {},
  ): Promise<ShadowReportsSummaryResponse> {
    return this.http.get(
      `/v1/protocol/shadow/evaluate-decision/reports/summary${this.scope(query)}`,
      ShadowReportsSummaryResponseSchema,
    );
  }

  async ingestSignalEnvelope(
    envelope: Omit<SignalEnvelope, "org_id">,
    write: WriteOptions,
  ): Promise<ArtifactAcceptedResponse> {
    const body = SignalEnvelopeSchema.parse({
      ...envelope,
      org_id: this.orgId,
    });
    return this.http.post(
      "/v1/protocol/signals/envelopes",
      body,
      ArtifactAcceptedResponseSchema,
      writeHeaders(write),
    );
  }

  /**
   * The OpenAPI declares no Idempotency-Key for this operation, so none is
   * sent; a replay records the same decision on the same dossier.
   */
  async federateSurfaceDecision(
    request: Omit<SurfaceDecisionRequest, "org_id">,
  ): Promise<SurfaceDecisionResponse> {
    const body = SurfaceDecisionRequestSchema.parse({
      ...request,
      org_id: this.orgId,
    });
    return this.http.post(
      "/v1/protocol/surfaces/decisions",
      body,
      SurfaceDecisionResponseSchema,
    );
  }

  private scope(query: ShadowReportQuery = {}): string {
    const params = new URLSearchParams({ org_id: this.orgId });
    if (query.mode) params.set("mode", query.mode);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.since) params.set("since", query.since);
    return `?${params.toString()}`;
  }
}

function writeHeaders(write: WriteOptions): RequestHeaders {
  if (!write.idempotencyKey) {
    throw new Error(
      "A write to the Decionis Protocol needs an idempotency key",
    );
  }
  return {
    "Idempotency-Key": write.idempotencyKey,
    ...(write.correlationId ? { "X-Correlation-ID": write.correlationId } : {}),
  };
}
