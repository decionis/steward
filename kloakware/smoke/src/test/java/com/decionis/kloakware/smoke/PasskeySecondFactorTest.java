package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Passkeys as the second factor (K11): the conditional subflow offers
 * WebAuthn beside the OTP form, the realm's WebAuthn policy is the committed
 * one, the registration action is on, and a user told to register one meets
 * the registration page right after the password. The ceremony itself
 * needs an authenticator, which a test JVM is not; what is proven is that
 * the realm asks for it where it should.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PasskeySecondFactorTest {

  private KloakwareStack stack;
  private String admin;

  @BeforeAll
  void useTheSharedStack() throws Exception {
    stack = SharedStack.get();
    admin = Admin.token(stack);
  }

  @Test
  void theSecondFactorSubflowOffersAPasskeyBesideTheOtp() throws Exception {
    JsonNode executions =
        Admin.get(stack, admin, "/authentication/flows/steward-browser%20second%20factor/executions");
    Map<String, String> requirements = new LinkedHashMap<>();
    for (JsonNode execution : executions) {
      requirements.put(execution.get("providerId").asText(), execution.get("requirement").asText());
    }
    assertEquals("REQUIRED", requirements.get("conditional-user-configured"), requirements.toString());
    assertEquals("ALTERNATIVE", requirements.get("webauthn-authenticator"), requirements.toString());
    assertEquals("ALTERNATIVE", requirements.get("auth-otp-form"), requirements.toString());
  }

  @Test
  void theWebAuthnPolicyAndTheRegistrationActionAreTheCommittedOnes() throws Exception {
    JsonNode realm = Admin.get(stack, admin, "");
    assertEquals("Kloakware", realm.get("webAuthnPolicyRpEntityName").asText());
    assertEquals("preferred", realm.get("webAuthnPolicyUserVerificationRequirement").asText());
    assertEquals("none", realm.get("webAuthnPolicyAttestationConveyancePreference").asText());
    assertTrue(realm.get("webAuthnPolicySignatureAlgorithms").toString().contains("ES256"));

    boolean enabled = false;
    for (JsonNode action : Admin.get(stack, admin, "/authentication/required-actions")) {
      if ("webauthn-register".equals(action.get("alias").asText())) enabled = action.get("enabled").asBoolean();
    }
    assertTrue(enabled, "the passkey registration action is on");
  }

  @Test
  void aUserToldToRegisterMeetsThePasskeyPageAfterThePassword() throws Exception {
    String username = "ops.example";
    JsonNode user = Admin.user(stack, admin, username);
    String id = user.get("id").asText();
    try {
      requireAction(id, "webauthn-register");

      HttpClient browser = Browser.newBrowser();
      Map<String, String> query = new LinkedHashMap<>();
      query.put("client_id", "steward");
      query.put("response_type", "code");
      query.put("scope", "openid");
      query.put("redirect_uri", KloakwareStack.STEWARD_URL + "/api/auth/oidc/callback");
      query.put("state", Browser.randomUrlSafe(8));
      query.put("code_challenge", Browser.challenge(Browser.randomUrlSafe(48)));
      query.put("code_challenge_method", "S256");
      HttpResponse<String> page =
          Browser.get(browser, stack.realmUrl() + "/protocol/openid-connect/auth?" + Browser.form(query));
      assertEquals(200, page.statusCode(), page.body());

      Map<String, String> credentials = new LinkedHashMap<>();
      credentials.put("username", username);
      credentials.put("password", stack.devUserPassword);
      credentials.put("credentialId", "");
      // The required action comes as a redirect within the realm, which a browser follows.
      HttpResponse<String> next =
          Browser.followWithinRealm(
              browser, Browser.postForm(browser, Browser.formAction(page.body()), credentials), stack.realmUrl());
      assertEquals(
          200,
          next.statusCode(),
          "not sent back with a code yet: " + next.headers().firstValue("Location").orElse("") + next.body());
      String body = next.body().toLowerCase();
      assertTrue(
          body.contains("webauthn") || body.contains("passkey") || body.contains("security key"),
          "the passkey registration page: " + next.body());
    } finally {
      requireAction(id, null);
    }
  }

  private void requireAction(String userId, String action) throws Exception {
    JsonNode user = Admin.get(stack, admin, "/users/" + userId);
    ArrayNode actions = ((ObjectNode) user).putArray("requiredActions");
    if (action != null) actions.add(action);
    HttpResponse<String> updated = Admin.send(stack, admin, "PUT", "/users/" + userId, user.toString());
    assertEquals(204, updated.statusCode(), updated.body());
  }
}
