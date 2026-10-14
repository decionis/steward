import { readFileSync } from "node:fs";
import { z } from "zod";

const RuntimeEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  STEWARD_DATA_MODE: z.enum(["demo", "live"]).optional(),
  DECIONIS_API_BASE_URL: z.string().url().optional(),
  DECIONIS_STEWARD_SERVICE_TOKEN: z.string().min(1).optional(),
  STEWARD_ACCESS_TOKEN_COOKIE: z
    .string()
    .min(1)
    .default("decionis_access_token"),
  STEWARD_ORG_ID_COOKIE: z.string().min(1).default("decionis_org_id"),
  NEXT_PUBLIC_DECIONIS_SIGN_IN_URL: z
    .string()
    .url()
    .default("https://decionis.com/sign-in"),
  DECIONIS_CONNECTOR_ID: z.string().min(1).optional(),
  DECIONIS_WEBHOOK_SECRET: z.string().min(1).optional(),
  DECIONIS_WEBHOOK_URL: z.string().url().optional(),
  DECIONIS_API_KEY: z.string().min(1).optional(),
  DECIONIS_ORG_ID: z.string().min(1).optional(),
  DECIONIS_WORKSPACE_NAME: z.string().min(1).optional(),
  STEWARD_DATABASE_URL: z.string().min(1).optional(),
  STEWARD_DATA_DIR: z.string().min(1).default("./data"),
  STEWARD_DATABASE_MIGRATE: z.enum(["on-start", "off"]).default("on-start"),
  STEWARD_OIDC_ISSUER_URL: z.string().url().optional(),
  STEWARD_OIDC_CLIENT_ID: z.string().min(1).optional(),
  STEWARD_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  STEWARD_OIDC_CLIENT_PRIVATE_KEY: z.string().min(1).optional(),
  STEWARD_OIDC_CLIENT_PRIVATE_KEY_FILE: z.string().min(1).optional(),
  STEWARD_OIDC_SCOPES: z.string().min(1).default("openid profile email"),
  STEWARD_PUBLIC_URL: z.string().url().optional(),
  STEWARD_SESSION_COOKIE: z.string().min(1).default("steward_session"),
  STEWARD_AUDIT_WEBHOOK_SECRET: z.string().min(1).optional(),
});

/**
 * Sign-in through kloakware, or any OpenID Connect issuer (docs/Kloakware.md,
 * K3): the issuer Steward trusts, the confidential client it is registered
 * as, and the public origin its redirect URI is built from. Set all three
 * `STEWARD_OIDC_*` values or none; the secret is a mounted environment
 * variable, never a file in the tree.
 */
export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  /** The client secret, for client_secret_post; null when a private key authenticates instead. */
  clientSecret: string | null;
  /** A PKCS#8 PEM private key, for private_key_jwt (the FAPI profile); null when a secret authenticates. */
  clientPrivateKey: string | null;
  scopes: string;
  /** Steward's origin as the browser and the issuer see it; null derives it from each request. */
  publicUrl: string | null;
}

/**
 * The Decionis workspace Steward acts for on the published Protocol
 * (docs/ProtocolContracts.md, decision D3): the organisation's API key, its
 * org id and the workspace name, under the names the deployment bundle emits.
 * Read from the environment here; the database is the other source, and the
 * environment wins when both are present.
 */
export interface DecionisWorkspaceConfig {
  /** The published API origin; https://api.decionis.com unless overridden. */
  baseUrl: string;
  apiKey: string;
  orgId: string;
  workspaceName: string | null;
}

export const DEFAULT_PROTOCOL_BASE_URL = "https://api.decionis.com";

/**
 * Steward's own records live in a database the operator chooses
 * (docs/Persistence.md). The scheme of STEWARD_DATABASE_URL selects the
 * dialect; with no URL outside demo mode the embedded database is used, a
 * file under STEWARD_DATA_DIR. Demo mode persists nothing and ignores both.
 */
export const DATABASE_DIALECTS = [
  "sqlite",
  "postgres",
  "mysql",
  "mssql",
  "oracle",
] as const;
export type DatabaseDialect = (typeof DATABASE_DIALECTS)[number];

export interface PersistenceConfig {
  dialect: DatabaseDialect;
  /** The connection URL for a server database; null for the embedded one. */
  url: string | null;
  /** The embedded database file, or ":memory:"; null for a server database. */
  file: string | null;
  migrate: "on-start" | "off";
}

/**
 * Where collected signals are forwarded: the Decionis Protocol's published
 * signal ingress, `POST /v1/signals/webhooks/:connectorId`, authenticated by
 * the connector's webhook secret. The three values are issued together by a
 * signal-mapping deployment bundle (https://decionis.com/docs/webhooks) and
 * are read from the environment under the names the bundle emits.
 */
export interface SignalIngressConfig {
  url: string;
  connectorId: string;
  webhookSecret: string;
}

export type StewardDataMode = "demo" | "live";

export interface StewardRuntimeValues {
  dataMode: StewardDataMode;
  apiBaseUrl: string | null;
  serviceToken: string | null;
  accessTokenCookie: string;
  orgIdCookie: string;
  signInUrl: string;
  timeoutMs: number;
  signalIngress: SignalIngressConfig | null;
  persistence: PersistenceConfig | null;
  decionisWorkspace: DecionisWorkspaceConfig | null;
  oidc?: OidcConfig | null;
  sessionCookie?: string;
  /** The secret kloakware's audit listener signs each record with; null disables the endpoint. */
  auditWebhookSecret?: string | null;
}

export class StewardRuntimeConfig {
  readonly dataMode: StewardDataMode;
  readonly apiBaseUrl: string | null;
  readonly serviceToken: string | null;
  readonly accessTokenCookie: string;
  readonly orgIdCookie: string;
  readonly signInUrl: string;
  readonly timeoutMs: number;
  readonly signalIngress: SignalIngressConfig | null;
  readonly persistence: PersistenceConfig | null;
  readonly decionisWorkspace: DecionisWorkspaceConfig | null;
  readonly oidc: OidcConfig | null;
  /** The cookie carrying Steward's own session id; one cookie, HttpOnly, opaque. */
  readonly sessionCookie: string;
  readonly auditWebhookSecret: string | null;

  constructor(values: StewardRuntimeValues) {
    this.dataMode = values.dataMode;
    this.apiBaseUrl = values.apiBaseUrl;
    this.serviceToken = values.serviceToken;
    this.accessTokenCookie = values.accessTokenCookie;
    this.orgIdCookie = values.orgIdCookie;
    this.signInUrl = values.signInUrl;
    this.timeoutMs = values.timeoutMs;
    this.signalIngress = values.signalIngress;
    this.persistence = values.persistence;
    this.decionisWorkspace = values.decionisWorkspace;
    this.oidc = values.oidc ?? null;
    this.sessionCookie = values.sessionCookie ?? "steward_session";
    this.auditWebhookSecret = values.auditWebhookSecret ?? null;
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): StewardRuntimeConfig {
    const parsed = RuntimeEnvironmentSchema.parse(environment);
    const dataMode =
      parsed.STEWARD_DATA_MODE ??
      (parsed.NODE_ENV === "production" ? "live" : "demo");

    if (dataMode === "live" && !parsed.DECIONIS_API_BASE_URL) {
      throw new Error(
        "DECIONIS_API_BASE_URL is required when STEWARD_DATA_MODE=live",
      );
    }

    const apiBaseUrl =
      parsed.DECIONIS_API_BASE_URL?.replace(/\/+$/, "") ?? null;
    const decionisWorkspace = StewardRuntimeConfig.readDecionisWorkspace(
      parsed,
      dataMode,
      apiBaseUrl,
    );

    return new StewardRuntimeConfig({
      dataMode,
      apiBaseUrl,
      serviceToken: parsed.DECIONIS_STEWARD_SERVICE_TOKEN ?? null,
      accessTokenCookie: parsed.STEWARD_ACCESS_TOKEN_COOKIE,
      orgIdCookie: parsed.STEWARD_ORG_ID_COOKIE,
      signInUrl: parsed.NEXT_PUBLIC_DECIONIS_SIGN_IN_URL,
      timeoutMs: 8_000,
      signalIngress: StewardRuntimeConfig.readSignalIngress(parsed, apiBaseUrl),
      persistence: StewardRuntimeConfig.readPersistence(parsed, dataMode),
      decionisWorkspace,
      oidc: StewardRuntimeConfig.readOidc(parsed, dataMode, decionisWorkspace),
      sessionCookie: parsed.STEWARD_SESSION_COOKIE,
      auditWebhookSecret:
        dataMode === "live"
          ? (parsed.STEWARD_AUDIT_WEBHOOK_SECRET ?? null)
          : null,
    });
  }

  private static readOidc(
    parsed: z.infer<typeof RuntimeEnvironmentSchema>,
    dataMode: StewardDataMode,
    decionisWorkspace: DecionisWorkspaceConfig | null,
  ): OidcConfig | null {
    if (dataMode === "demo") return null;
    const issuerUrl = parsed.STEWARD_OIDC_ISSUER_URL;
    const clientId = parsed.STEWARD_OIDC_CLIENT_ID;
    const clientSecret = parsed.STEWARD_OIDC_CLIENT_SECRET ?? null;
    const clientPrivateKey = StewardRuntimeConfig.readPrivateKey(parsed);
    if (!issuerUrl && !clientId && !clientSecret && !clientPrivateKey)
      return null;
    if (!issuerUrl || !clientId || (!clientSecret && !clientPrivateKey)) {
      throw new Error(
        "STEWARD_OIDC_ISSUER_URL, STEWARD_OIDC_CLIENT_ID and one of STEWARD_OIDC_CLIENT_SECRET or STEWARD_OIDC_CLIENT_PRIVATE_KEY(_FILE) go together; set them or none",
      );
    }
    if (clientSecret && clientPrivateKey) {
      throw new Error(
        "STEWARD_OIDC_CLIENT_SECRET and STEWARD_OIDC_CLIENT_PRIVATE_KEY(_FILE) are two ways to authenticate the client; set one",
      );
    }
    if (!decionisWorkspace) {
      throw new Error(
        "A sign-in through kloakware is scoped to the configured organisation: set DECIONIS_API_KEY and DECIONIS_ORG_ID with the STEWARD_OIDC_* values",
      );
    }
    return {
      issuerUrl: issuerUrl.replace(/\/+$/, ""),
      clientId,
      clientSecret,
      clientPrivateKey,
      scopes: parsed.STEWARD_OIDC_SCOPES,
      publicUrl: parsed.STEWARD_PUBLIC_URL?.replace(/\/+$/, "") ?? null,
    };
  }

  /**
   * The client's private key for private_key_jwt: the PEM itself, or the
   * path of a mounted file holding it, as a Kubernetes Secret is mounted.
   */
  private static readPrivateKey(
    parsed: z.infer<typeof RuntimeEnvironmentSchema>,
  ): string | null {
    if (parsed.STEWARD_OIDC_CLIENT_PRIVATE_KEY) {
      return parsed.STEWARD_OIDC_CLIENT_PRIVATE_KEY.replace(/\\n/g, "\n");
    }
    if (parsed.STEWARD_OIDC_CLIENT_PRIVATE_KEY_FILE) {
      return readFileSync(parsed.STEWARD_OIDC_CLIENT_PRIVATE_KEY_FILE, "utf8");
    }
    return null;
  }

  private static readDecionisWorkspace(
    parsed: z.infer<typeof RuntimeEnvironmentSchema>,
    dataMode: StewardDataMode,
    apiBaseUrl: string | null,
  ): DecionisWorkspaceConfig | null {
    if (dataMode === "demo") return null;
    const apiKey = parsed.DECIONIS_API_KEY;
    const orgId = parsed.DECIONIS_ORG_ID;
    if (!apiKey && !orgId) return null;
    if (!apiKey || !orgId) {
      throw new Error(
        "DECIONIS_API_KEY and DECIONIS_ORG_ID are issued together by the Decionis deployment bundle; set both or neither",
      );
    }
    if (!z.guid().safeParse(orgId).success) {
      throw new Error(
        "DECIONIS_ORG_ID must be the organisation's id as the deployment bundle issues it, a UUID",
      );
    }
    return {
      baseUrl: apiBaseUrl ?? DEFAULT_PROTOCOL_BASE_URL,
      apiKey,
      orgId,
      workspaceName: parsed.DECIONIS_WORKSPACE_NAME ?? null,
    };
  }

  private static readPersistence(
    parsed: z.infer<typeof RuntimeEnvironmentSchema>,
    dataMode: StewardDataMode,
  ): PersistenceConfig | null {
    if (dataMode === "demo") return null;
    const migrate = parsed.STEWARD_DATABASE_MIGRATE;
    const url = parsed.STEWARD_DATABASE_URL;
    if (!url) {
      const directory = parsed.STEWARD_DATA_DIR.replace(/\/+$/, "");
      return {
        dialect: "sqlite",
        url: null,
        file: `${directory}/steward.sqlite`,
        migrate,
      };
    }
    if (url.startsWith("sqlite:")) {
      const target = url.slice("sqlite:".length).replace(/^\/\//, "");
      if (!target) {
        throw new Error(
          "STEWARD_DATABASE_URL: sqlite needs a file path (sqlite:///path/steward.sqlite) or :memory:",
        );
      }
      return { dialect: "sqlite", url: null, file: target, migrate };
    }
    const scheme = url.split(":", 1)[0]?.toLowerCase() ?? "";
    const dialect = (
      {
        postgres: "postgres",
        postgresql: "postgres",
        mysql: "mysql",
        mssql: "mssql",
        sqlserver: "mssql",
        oracle: "oracle",
      } as Record<string, DatabaseDialect | undefined>
    )[scheme];
    if (!dialect) {
      throw new Error(
        `STEWARD_DATABASE_URL: unsupported scheme "${scheme}"; use sqlite, postgres, mysql, mssql or oracle`,
      );
    }
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = /^[a-z]+:\/\//i.test(url) ? new URL(url) : null;
    } catch {
      parsedUrl = null;
    }
    if (!parsedUrl?.hostname) {
      throw new Error(
        "STEWARD_DATABASE_URL must be of the form scheme://user:password@host:port/database",
      );
    }
    return { dialect, url, file: null, migrate };
  }

  private static readSignalIngress(
    parsed: z.infer<typeof RuntimeEnvironmentSchema>,
    apiBaseUrl: string | null,
  ): SignalIngressConfig | null {
    const connectorId = parsed.DECIONIS_CONNECTOR_ID;
    const webhookSecret = parsed.DECIONIS_WEBHOOK_SECRET;
    if (!connectorId && !webhookSecret) return null;
    if (!connectorId || !webhookSecret) {
      throw new Error(
        "DECIONIS_CONNECTOR_ID and DECIONIS_WEBHOOK_SECRET are issued together by the Decionis deployment bundle; set both or neither",
      );
    }
    const url =
      parsed.DECIONIS_WEBHOOK_URL ??
      (apiBaseUrl
        ? `${apiBaseUrl}/v1/signals/webhooks/${encodeURIComponent(connectorId)}`
        : null);
    if (!url) {
      throw new Error(
        "DECIONIS_WEBHOOK_URL or DECIONIS_API_BASE_URL is required to forward signals",
      );
    }
    if (url.includes(webhookSecret)) {
      throw new Error(
        "DECIONIS_WEBHOOK_URL must not carry the webhook secret; it travels in the x-webhook-secret header",
      );
    }
    return { url, connectorId, webhookSecret };
  }
}
