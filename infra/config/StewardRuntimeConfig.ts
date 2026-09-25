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
  STEWARD_DATABASE_URL: z.string().min(1).optional(),
  STEWARD_DATA_DIR: z.string().min(1).default("./data"),
  STEWARD_DATABASE_MIGRATE: z.enum(["on-start", "off"]).default("on-start"),
});

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
    });
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
