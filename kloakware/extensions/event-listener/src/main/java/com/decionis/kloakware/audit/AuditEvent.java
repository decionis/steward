package com.decionis.kloakware.audit;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.keycloak.events.Event;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.util.JsonSerialization;

/**
 * One audit record, the same shape for a user event and an admin event: what
 * happened, when, in which realm, to whom, from where. Pure: built from the
 * event's fields, serialised with the Jackson the server ships, signed with
 * the HMAC Steward verifies. Nothing here touches a session.
 */
public final class AuditEvent {

  public static final String SIGNATURE_PREFIX = "sha256=";

  private final Map<String, Object> fields;

  private AuditEvent(Map<String, Object> fields) {
    this.fields = fields;
  }

  public static AuditEvent from(Event event) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("kind", "user");
    fields.put("type", event.getType() == null ? null : event.getType().name());
    fields.put("time", Instant.ofEpochMilli(event.getTime()).toString());
    fields.put("realm", event.getRealmName() != null ? event.getRealmName() : event.getRealmId());
    fields.put("userId", event.getUserId());
    fields.put("clientId", event.getClientId());
    fields.put("sessionId", event.getSessionId());
    fields.put("ipAddress", event.getIpAddress());
    fields.put("error", event.getError());
    fields.put("details", event.getDetails() == null ? Map.of() : new TreeMap<>(event.getDetails()));
    return new AuditEvent(fields);
  }

  public static AuditEvent from(AdminEvent event) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("kind", "admin");
    fields.put("type", event.getOperationType() == null ? null : event.getOperationType().name());
    fields.put("time", Instant.ofEpochMilli(event.getTime()).toString());
    fields.put("realm", event.getRealmName() != null ? event.getRealmName() : event.getRealmId());
    fields.put("resourceType", event.getResourceTypeAsString());
    fields.put("resourcePath", event.getResourcePath());
    fields.put("userId", event.getAuthDetails() == null ? null : event.getAuthDetails().getUserId());
    fields.put("clientId", event.getAuthDetails() == null ? null : event.getAuthDetails().getClientId());
    fields.put("ipAddress", event.getAuthDetails() == null ? null : event.getAuthDetails().getIpAddress());
    fields.put("error", event.getError());
    return new AuditEvent(fields);
  }

  /** For tests and for sinks that build their own: the fields as given. */
  public static AuditEvent of(Map<String, Object> fields) {
    return new AuditEvent(new LinkedHashMap<>(fields));
  }

  public String type() {
    Object type = fields.get("type");
    return type == null ? "" : type.toString();
  }

  public Map<String, Object> fields() {
    return fields;
  }

  public String toJson() {
    try {
      return JsonSerialization.writeValueAsString(fields);
    } catch (Exception error) {
      throw new IllegalStateException("The audit event could not be serialised", error);
    }
  }

  /** The signature Steward checks: HMAC-SHA256 over "<timestamp>.<body>", hex, prefixed. */
  public static String signature(String secret, String timestamp, String body) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      byte[] digest = mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(SIGNATURE_PREFIX);
      for (byte b : digest) hex.append(String.format("%02x", b));
      return hex.toString();
    } catch (Exception error) {
      throw new IllegalStateException("HMAC-SHA256 is not available", error);
    }
  }
}
