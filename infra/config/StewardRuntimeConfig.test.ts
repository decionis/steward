import { describe, expect, it } from "vitest";
import { StewardRuntimeConfig } from "./StewardRuntimeConfig";

describe("StewardRuntimeConfig", () => {
  it("defaults to demo outside production", () => {
    const config = StewardRuntimeConfig.fromEnvironment({
      NODE_ENV: "development",
    });

    expect(config.dataMode).toBe("demo");
    expect(config.apiBaseUrl).toBeNull();
  });

  it("requires the Decionis API in live mode", () => {
    expect(() =>
      StewardRuntimeConfig.fromEnvironment({
        NODE_ENV: "production",
        STEWARD_DATA_MODE: "live",
      }),
    ).toThrow("DECIONIS_API_BASE_URL");
  });

  it("normalizes a configured API base", () => {
    const config = StewardRuntimeConfig.fromEnvironment({
      NODE_ENV: "production",
      STEWARD_DATA_MODE: "live",
      DECIONIS_API_BASE_URL: "https://api.decionis.com/",
    });

    expect(config.apiBaseUrl).toBe("https://api.decionis.com");
  });
});

describe("StewardRuntimeConfig — the signal ingress", () => {
  const live = {
    NODE_ENV: "production",
    STEWARD_DATA_MODE: "live",
    DECIONIS_API_BASE_URL: "https://api.decionis.com",
  } as const;

  it("is absent until the deployment bundle's values are set", () => {
    expect(StewardRuntimeConfig.fromEnvironment(live).signalIngress).toBeNull();
  });

  it("derives the ingress URL from the API origin and the connector id", () => {
    const config = StewardRuntimeConfig.fromEnvironment({
      ...live,
      DECIONIS_CONNECTOR_ID: "conn_kilo",
      DECIONIS_WEBHOOK_SECRET: "whsec_test",
    });

    expect(config.signalIngress).toEqual({
      url: "https://api.decionis.com/v1/signals/webhooks/conn_kilo",
      connectorId: "conn_kilo",
      webhookSecret: "whsec_test",
    });
  });

  it("prefers the bundle's own webhook URL when given", () => {
    const config = StewardRuntimeConfig.fromEnvironment({
      ...live,
      DECIONIS_CONNECTOR_ID: "conn_kilo",
      DECIONIS_WEBHOOK_SECRET: "whsec_test",
      DECIONIS_WEBHOOK_URL:
        "https://ingress.decionis.example/v1/signals/webhooks/conn_kilo",
    });

    expect(config.signalIngress?.url).toBe(
      "https://ingress.decionis.example/v1/signals/webhooks/conn_kilo",
    );
  });

  it("refuses a connector id without its secret, and the reverse, at startup", () => {
    expect(() =>
      StewardRuntimeConfig.fromEnvironment({
        ...live,
        DECIONIS_CONNECTOR_ID: "conn_kilo",
      }),
    ).toThrow("set both or neither");
    expect(() =>
      StewardRuntimeConfig.fromEnvironment({
        ...live,
        DECIONIS_WEBHOOK_SECRET: "whsec_test",
      }),
    ).toThrow("set both or neither");
  });

  it("refuses a webhook URL that carries the secret", () => {
    expect(() =>
      StewardRuntimeConfig.fromEnvironment({
        ...live,
        DECIONIS_CONNECTOR_ID: "conn_kilo",
        DECIONIS_WEBHOOK_SECRET: "whsec_test",
        DECIONIS_WEBHOOK_URL:
          "https://api.decionis.com/v1/signals/webhooks/conn_kilo?secret=whsec_test",
      }),
    ).toThrow("must not carry the webhook secret");
  });

  it("needs an origin to derive the URL from in demo mode too", () => {
    expect(() =>
      StewardRuntimeConfig.fromEnvironment({
        NODE_ENV: "development",
        DECIONIS_CONNECTOR_ID: "conn_kilo",
        DECIONIS_WEBHOOK_SECRET: "whsec_test",
      }),
    ).toThrow("DECIONIS_WEBHOOK_URL or DECIONIS_API_BASE_URL");
  });
});
