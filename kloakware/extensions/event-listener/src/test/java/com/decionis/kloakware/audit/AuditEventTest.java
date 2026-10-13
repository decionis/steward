package com.decionis.kloakware.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.keycloak.events.Event;
import org.keycloak.events.EventType;

class AuditEventTest {

  @Test
  void aUserEventBecomesOneRecordWithTheFieldsAnAuditorAsksFor() {
    Event event = new Event();
    event.setType(EventType.LOGIN);
    event.setTime(1_760_000_000_000L);
    event.setRealmId("realm-id");
    event.setRealmName("steward");
    event.setUserId("user-1");
    event.setClientId("steward");
    event.setSessionId("sid-1");
    event.setIpAddress("10.0.0.7");
    event.setDetails(Map.of("username", "erin.example", "auth_method", "openid-connect"));

    String json = AuditEvent.from(event).toJson();

    assertTrue(json.startsWith("{\"kind\":\"user\",\"type\":\"LOGIN\",\"time\":\"2025-10-09T08:53:20Z\""), json);
    assertTrue(json.contains("\"realm\":\"steward\""), json);
    assertTrue(json.contains("\"userId\":\"user-1\""), json);
    assertTrue(json.contains("\"details\":{\"auth_method\":\"openid-connect\",\"username\":\"erin.example\"}"), json);
  }

  @Test
  void theSignatureIsHmacSha256OverTheTimestampAndTheBody() {
    String signature = AuditEvent.signature("secret", "1760000000000", "{\"type\":\"LOGIN\"}");
    assertTrue(signature.startsWith("sha256="));
    assertEquals(7 + 64, signature.length());
    assertEquals(signature, AuditEvent.signature("secret", "1760000000000", "{\"type\":\"LOGIN\"}"));
    assertTrue(!signature.equals(AuditEvent.signature("other", "1760000000000", "{\"type\":\"LOGIN\"}")));
    assertTrue(!signature.equals(AuditEvent.signature("secret", "1760000000001", "{\"type\":\"LOGIN\"}")));
  }

  @Test
  void theStandardOutputSinkWritesOnePrefixedLine() {
    ByteArrayOutputStream captured = new ByteArrayOutputStream();
    new StdoutAuditSink(new PrintStream(captured)).publish(AuditEvent.of(Map.of("type", "LOGOUT")));
    assertEquals("kloakware-audit {\"type\":\"LOGOUT\"}" + System.lineSeparator(), captured.toString());
  }

  @Test
  void theEventTypeListIsParsedAndUnknownNamesAreIgnored() {
    var types = StewardAuditListenerProviderFactory.parseEventTypes(" LOGIN, LOGOUT ,NOT_A_TYPE,,LOGIN_ERROR");
    assertEquals(3, types.size());
    assertTrue(types.contains(EventType.LOGIN) && types.contains(EventType.LOGOUT) && types.contains(EventType.LOGIN_ERROR));
    assertTrue(StewardAuditListenerProviderFactory.parseEventTypes(StewardAuditListenerProviderFactory.DEFAULT_EVENT_TYPES).size() > 10);
  }
}
