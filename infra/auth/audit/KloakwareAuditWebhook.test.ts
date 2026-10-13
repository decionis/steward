/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
  KloakwareAuditWebhook,
  KloakwareAuditWebhookError,
  TIMESTAMP_TOLERANCE_MS,
} from "./KloakwareAuditWebhook";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const SECRET = "shared-secret";
const body = JSON.stringify({
  kind: "user",
  type: "LOGIN",
  time: "2026-10-13T11:59:59.000Z",
  realm: "steward",
  userId: "kc-user-1",
  clientId: "steward",
  sessionId: "sid-1",
  ipAddress: "10.0.0.7",
  error: null,
  details: { username: "erin.example", auth_method: "openid-connect" },
});

function signed(
  timestamp = String(NOW.getTime()),
  secret = SECRET,
  payload = body,
) {
  return {
    timestamp,
    signature: KloakwareAuditWebhook.signature(secret, timestamp, payload),
    body: payload,
  };
}

describe("KloakwareAuditWebhook — verification", () => {
  const webhook = new KloakwareAuditWebhook(SECRET, () => NOW);

  it("accepts a record signed under the shared secret within the window", () => {
    const record = webhook.verify(signed());
    expect(record.type).toBe("LOGIN");
    expect(record.details?.username).toBe("erin.example");
  });

  it("refuses missing headers, a stale timestamp, a wrong secret, an altered body, and garbage", () => {
    expect(() => webhook.verify({ ...signed(), signature: null })).toThrow(
      KloakwareAuditWebhookError,
    );
    expect(() => webhook.verify({ ...signed(), timestamp: null })).toThrowError(
      /missing_headers/,
    );
    expect(() =>
      webhook.verify(
        signed(String(NOW.getTime() - TIMESTAMP_TOLERANCE_MS - 1)),
      ),
    ).toThrowError(/stale_timestamp/);
    expect(() =>
      webhook.verify(signed(String(NOW.getTime()), "other-secret")),
    ).toThrowError(/bad_signature/);
    const altered = {
      ...signed(),
      body: body.replace("erin.example", "mallory"),
    };
    expect(() => webhook.verify(altered)).toThrowError(/bad_signature/);
    expect(() =>
      webhook.verify(signed(String(NOW.getTime()), SECRET, "not json")),
    ).toThrowError(/malformed_body/);
    expect(() =>
      webhook.verify(
        signed(String(NOW.getTime()), SECRET, JSON.stringify({ kind: "user" })),
      ),
    ).toThrowError(/malformed_body/);
  });

  it("signs the way the listener does: sha256= and hex over the timestamp and the body", () => {
    const signature = KloakwareAuditWebhook.signature(
      SECRET,
      "1760000000000",
      "{}",
    );
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(
      KloakwareAuditWebhook.signature(SECRET, "1760000000001", "{}"),
    ).not.toBe(signature);
  });
});

describe("KloakwareAuditWebhook — the activity it becomes", () => {
  it("names the kind in Steward's vocabulary, the actor by username, and keeps the facts without the profile", () => {
    const record = new KloakwareAuditWebhook(SECRET, () => NOW).verify(
      signed(),
    );
    const activity = KloakwareAuditWebhook.toActivity(record);
    expect(activity.kind).toBe("KLOAKWARE_LOGIN");
    expect(activity.subjectReference).toBe("erin.example");
    expect(JSON.parse(activity.detail)).toEqual({
      realm: "steward",
      clientId: "steward",
      ipAddress: "10.0.0.7",
      error: null,
      time: "2026-10-13T11:59:59.000Z",
    });
  });

  it("marks an admin operation and keeps what it touched", () => {
    const activity = KloakwareAuditWebhook.toActivity({
      kind: "admin",
      type: "UPDATE",
      time: "2026-10-13T11:00:00.000Z",
      realm: "steward",
      userId: "admin-1",
      resourceType: "USER",
      resourcePath: "users/abc",
    });
    expect(activity.kind).toBe("KLOAKWARE_ADMIN_UPDATE");
    expect(activity.subjectReference).toBe("admin-1");
    expect(JSON.parse(activity.detail)).toMatchObject({
      resourceType: "USER",
      resourcePath: "users/abc",
    });
  });
});
