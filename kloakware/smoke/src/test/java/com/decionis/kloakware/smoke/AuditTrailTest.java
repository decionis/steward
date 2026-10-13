package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.decionis.kloakware.audit.AuditEvent;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The audit listener compiled into the server: a sign-in and a failed sign-in
 * each become one record on standard output and one signed POST to Steward's
 * activities endpoint, here the receiver in this JVM. The signature is
 * verified the way Steward verifies it.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AuditTrailTest {

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void aSignInIsRecordedAndPostedWithAValidSignature() throws Exception {
    Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);

    AuditReceiver.Received record = stack.auditReceiver().await("LOGIN", KloakwareStack.DEV_USER, 10_000);
    assertNotNull(record, "the LOGIN record reached the receiver");
    assertEquals(
        AuditEvent.signature(stack.auditSecret, record.timestamp(), record.body()),
        record.signature(),
        "signed with the shared secret over the timestamp and the body");
    JsonNode body = Tokens.JSON.readTree(record.body());
    assertEquals("user", body.get("kind").asText());
    assertEquals("steward", body.get("realm").asText());
    assertEquals("kloakware-smoke", body.get("clientId").asText());
    assertEquals(KloakwareStack.DEV_USER, body.path("details").path("username").asText());
    assertTrue(body.hasNonNull("userId") && body.hasNonNull("time"));

    assertTrue(
        stack.serverLogs().contains("kloakware-audit {\"kind\":\"user\",\"type\":\"LOGIN\""),
        "the standard-output sink wrote the same record");
  }

  @Test
  void aFailedSignInIsRecordedWithItsError() throws Exception {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "password");
    form.put("client_id", "kloakware-smoke");
    form.put("username", KloakwareStack.DEV_USER);
    form.put("password", "not-the-password");
    form.put("scope", "openid");
    HttpResponse<String> refused =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", form, null);
    assertTrue(refused.statusCode() == 400 || refused.statusCode() == 401, "refused: " + refused.statusCode());
    assertEquals("invalid_grant", Tokens.JSON.readTree(refused.body()).get("error").asText());

    AuditReceiver.Received record = stack.auditReceiver().await("LOGIN_ERROR", KloakwareStack.DEV_USER, 10_000);
    assertNotNull(record, "the LOGIN_ERROR record reached the receiver");
    JsonNode body = Tokens.JSON.readTree(record.body());
    assertEquals("invalid_user_credentials", body.get("error").asText());
    assertEquals(
        AuditEvent.signature(stack.auditSecret, record.timestamp(), record.body()), record.signature());
  }
}
