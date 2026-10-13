package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The legacy password hash compiled into the server: a user seeded with a
 * salted SHA-256 from a pre-Keycloak system signs in with the password they
 * have; the first sign-in rehashes the credential with the realm's policy,
 * argon2; the second sign-in works against the new hash.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LegacyPasswordTest {

  /** The password the dev overlay's legacy hash was computed from (see .env.example). */
  static final String LEGACY_PASSWORD = "Legacy-Sign-In-2026!";

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void theLegacyHashVerifiesOnceAndIsReplacedByThePolicysAlgorithm() throws Exception {
    JsonNode first = Tokens.passwordGrant(stack, "kloakware-smoke", "legacy.example", LEGACY_PASSWORD);
    assertTrue(first.hasNonNull("access_token"), "the legacy hash verified");

    JsonNode credential = passwordCredential("legacy.example");
    JsonNode data = Tokens.JSON.readTree(credential.get("credentialData").asText());
    assertEquals("argon2", data.get("algorithm").asText(), "rehashed on the first sign-in");

    JsonNode second = Tokens.passwordGrant(stack, "kloakware-smoke", "legacy.example", LEGACY_PASSWORD);
    assertTrue(second.hasNonNull("access_token"), "the new hash verifies too");
  }

  private JsonNode passwordCredential(String username) throws Exception {
    String token = adminToken();
    JsonNode users = adminGet(token, "/users?username=" + username + "&exact=true");
    assertEquals(1, users.size());
    JsonNode credentials = adminGet(token, "/users/" + users.get(0).get("id").asText() + "/credentials");
    for (JsonNode credential : credentials) {
      if ("password".equals(credential.get("type").asText())) return credential;
    }
    throw new AssertionError("no password credential");
  }

  private JsonNode adminGet(String token, String path) throws Exception {
    HttpResponse<String> response =
        Tokens.HTTP.send(
            HttpRequest.newBuilder(URI.create(stack.adminUrl() + path)).header("Authorization", "Bearer " + token).GET().build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode(), response.body());
    return Tokens.JSON.readTree(response.body());
  }

  private String adminToken() throws Exception {
    String form =
        "grant_type=password&client_id=admin-cli&username=admin&password="
            + URLEncoder.encode(stack.adminPassword, StandardCharsets.UTF_8);
    HttpResponse<String> response =
        Tokens.HTTP.send(
            HttpRequest.newBuilder(URI.create(stack.masterTokenUrl())).header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode(), response.body());
    return Tokens.JSON.readTree(response.body()).get("access_token").asText();
  }
}
