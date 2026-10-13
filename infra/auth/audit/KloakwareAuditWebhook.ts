import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** How far a record's timestamp may sit from now before it is refused as a replay. */
export const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/** What kloakware's audit listener posts: one record per event, user or admin. */
export const KloakwareAuditRecordSchema = z.object({
  kind: z.enum(["user", "admin"]),
  type: z.string().min(1),
  time: z.string().min(1),
  realm: z.string().min(1),
  userId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  resourceType: z.string().nullable().optional(),
  resourcePath: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type KloakwareAuditRecord = z.infer<typeof KloakwareAuditRecordSchema>;

export type VerificationFailure =
  "missing_headers" | "stale_timestamp" | "bad_signature" | "malformed_body";

export class KloakwareAuditWebhookError extends Error {
  constructor(readonly reason: VerificationFailure) {
    super(`The audit record was refused: ${reason}`);
    this.name = "KloakwareAuditWebhookError";
  }
}

/**
 * Verifies a record the way the listener signs it: HMAC-SHA256 under the
 * shared secret over "<timestamp>.<body>", hex, prefixed `sha256=`, compared
 * in constant time, with the timestamp within five minutes of now so a
 * captured request cannot be replayed later. Then the body is parsed.
 */
export class KloakwareAuditWebhook {
  constructor(
    private readonly secret: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  static signature(secret: string, timestamp: string, body: string): string {
    return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  }

  verify(input: {
    timestamp: string | null;
    signature: string | null;
    body: string;
  }): KloakwareAuditRecord {
    if (!input.timestamp || !input.signature) {
      throw new KloakwareAuditWebhookError("missing_headers");
    }
    const sent = Number(input.timestamp);
    if (
      !Number.isFinite(sent) ||
      Math.abs(this.clock().getTime() - sent) > TIMESTAMP_TOLERANCE_MS
    ) {
      throw new KloakwareAuditWebhookError("stale_timestamp");
    }
    const expected = Buffer.from(
      KloakwareAuditWebhook.signature(this.secret, input.timestamp, input.body),
    );
    const given = Buffer.from(input.signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new KloakwareAuditWebhookError("bad_signature");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.body);
    } catch {
      throw new KloakwareAuditWebhookError("malformed_body");
    }
    const record = KloakwareAuditRecordSchema.safeParse(parsed);
    if (!record.success) throw new KloakwareAuditWebhookError("malformed_body");
    return record.data;
  }

  /** The activity row a record becomes: a kind in Steward's vocabulary, the actor's reference, the facts worth keeping. */
  static toActivity(record: KloakwareAuditRecord): {
    kind: string;
    subjectReference: string | null;
    detail: string;
  } {
    const username =
      typeof record.details?.username === "string"
        ? record.details.username
        : null;
    const detail: Record<string, unknown> = {
      realm: record.realm,
      clientId: record.clientId ?? null,
      ipAddress: record.ipAddress ?? null,
      error: record.error ?? null,
      time: record.time,
    };
    if (record.kind === "admin") {
      detail.resourceType = record.resourceType ?? null;
      detail.resourcePath = record.resourcePath ?? null;
    }
    return {
      kind: `KLOAKWARE_${record.kind === "admin" ? "ADMIN_" : ""}${record.type}`,
      subjectReference: username ?? record.userId ?? null,
      detail: JSON.stringify(detail),
    };
  }
}
