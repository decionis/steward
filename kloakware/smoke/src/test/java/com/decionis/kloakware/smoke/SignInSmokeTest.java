package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Proves the image and the realm together: the realm publishes what Steward's
 * sign-in relies on, the seeded operator signs in and carries their roles, a
 * refresh token rotates and a reused one is refused, and the management port
 * answers health and metrics. The password grant used here belongs to the
 * dev-only smoke client; the Steward client itself has it disabled.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SignInSmokeTest {

  private static final HttpClient HTTP = HttpClient.newHttpClient();
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String SMOKE_CLIENT = "kloakware-smoke";

  private KloakwareStack stack;

  @BeforeAll
  void startTheStack() {
    stack = new KloakwareStack(Path.of(System.getProperty("kloakware.root", "..")));
    stack.start();
  }

  @AfterAll
  void stopTheStack() {
    if (stack != null) stack.close();
  }

  @Test
  void theRealmPublishesWhatStewardReliesOn() throws Exception {
    JsonNode discovery = getJson(stack.realmUrl() + "/.well-known/openid-configuration");

    assertEquals(stack.realmUrl(), discovery.get("issuer").asText());
    assertTrue(discovery.get("backchannel_logout_supported").asBoolean());
    assertTrue(discovery.get("backchannel_logout_session_supported").asBoolean());
    assertTrue(has(discovery.get("code_challenge_methods_supported"), "S256"));
    assertTrue(has(discovery.get("grant_types_supported"), "authorization_code"));
    assertTrue(discovery.hasNonNull("end_session_endpoint"));
    assertTrue(discovery.hasNonNull("revocation_endpoint"));
  }

  @Test
  void theSeededOperatorSignsInAndCarriesTheirRoles() throws Exception {
    JsonNode tokens = passwordGrant();
    JsonNode claims = claims(tokens.get("access_token").asText());

    assertEquals(stack.realmUrl(), claims.get("iss").asText());
    assertEquals(KloakwareStack.DEV_USER, claims.get("preferred_username").asText());

    JsonNode roles = claims.path("realm_access").path("roles");
    assertTrue(has(roles, "steward-admin"), "assigned directly");
    assertTrue(has(roles, "steward-approver"), "assigned directly");
    assertTrue(has(roles, "steward-viewer"), "the floor, through the default role");

    // Five minutes: the access token lifespan the realm sets.
    assertEquals(300, claims.get("exp").asLong() - claims.get("iat").asLong());
    assertEquals(300, tokens.get("expires_in").asInt());
  }

  @Test
  void aRefreshTokenRotatesAndAReusedOneIsRefused() throws Exception {
    String first = passwordGrant().get("refresh_token").asText();

    HttpResponse<String> rotated = refresh(first);
    assertEquals(200, rotated.statusCode());
    String second = JSON.readTree(rotated.body()).get("refresh_token").asText();
    assertNotEquals(first, second, "every refresh issues a new refresh token");

    HttpResponse<String> reused = refresh(first);
    assertEquals(400, reused.statusCode(), "the realm revokes a refresh token once it is used");
    assertEquals("invalid_grant", JSON.readTree(reused.body()).get("error").asText());
  }

  @Test
  void theManagementPortReportsHealthAndMetrics() throws Exception {
    HttpResponse<String> ready = get(stack.managementUrl() + "/health/ready");
    assertEquals(200, ready.statusCode());
    assertEquals("UP", JSON.readTree(ready.body()).get("status").asText());

    HttpResponse<String> metrics = get(stack.managementUrl() + "/metrics");
    assertEquals(200, metrics.statusCode());
    assertTrue(metrics.body().contains("jvm_memory_used_bytes"), "JVM metrics are exposed");
  }

  private JsonNode passwordGrant() throws IOException, InterruptedException {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "password");
    form.put("client_id", SMOKE_CLIENT);
    form.put("username", KloakwareStack.DEV_USER);
    form.put("password", stack.devUserPassword);
    form.put("scope", "openid");
    HttpResponse<String> response = postForm(stack.realmUrl() + "/protocol/openid-connect/token", form);
    assertEquals(200, response.statusCode(), response.body());
    return JSON.readTree(response.body());
  }

  private HttpResponse<String> refresh(String refreshToken) throws IOException, InterruptedException {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "refresh_token");
    form.put("client_id", SMOKE_CLIENT);
    form.put("refresh_token", refreshToken);
    return postForm(stack.realmUrl() + "/protocol/openid-connect/token", form);
  }

  private static HttpResponse<String> postForm(String url, Map<String, String> form)
      throws IOException, InterruptedException {
    String body =
        form.entrySet().stream()
            .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
            .collect(Collectors.joining("&"));
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
    return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private static HttpResponse<String> get(String url) throws IOException, InterruptedException {
    return HTTP.send(
        HttpRequest.newBuilder(URI.create(url)).GET().build(),
        HttpResponse.BodyHandlers.ofString());
  }

  private static JsonNode getJson(String url) throws IOException, InterruptedException {
    HttpResponse<String> response = get(url);
    assertEquals(200, response.statusCode(), response.body());
    return JSON.readTree(response.body());
  }

  /** The claims of a JWT, read without verification: the test is the issuer's own client. */
  private static JsonNode claims(String jwt) throws IOException {
    String payload = jwt.split("\\.")[1];
    return JSON.readTree(Base64.getUrlDecoder().decode(payload));
  }

  private static boolean has(JsonNode array, String value) {
    for (JsonNode element : array) {
      if (value.equals(element.asText())) return true;
    }
    return false;
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
