package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Git wins. A change made by hand in the Admin UI, here through the admin API,
 * is undone by the next run of keycloak-config-cli over an unchanged file:
 * the realm converges to what is committed, which is what makes the file the
 * record and the UI a viewer. Covers a realm setting and a client attribute.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RealmConvergenceTest {

  private static final HttpClient HTTP = HttpClient.newHttpClient();
  private static final ObjectMapper JSON = new ObjectMapper();

  private KloakwareStack stack;
  private String adminToken;

  @BeforeAll
  void useTheSharedStack() throws Exception {
    stack = SharedStack.get();
    adminToken = adminToken();
  }

  @Test
  void aHandMadeChangeToTheRealmIsUndoneByTheNextApply() throws Exception {
    ObjectNode drift = JSON.createObjectNode();
    drift.put("accessTokenLifespan", 600);
    assertEquals(204, put(stack.adminUrl(), drift).statusCode());
    assertEquals(600, realm().get("accessTokenLifespan").asInt(), "the hand-made change is live");

    stack.reapplyRealm();

    assertEquals(300, realm().get("accessTokenLifespan").asInt(), "the file wins");
  }

  @Test
  void aHandMadeChangeToTheClientIsUndoneByTheNextApply() throws Exception {
    JsonNode client = client("steward");
    String id = client.get("id").asText();
    ObjectNode weakened = (ObjectNode) client.deepCopy();
    ((ObjectNode) weakened.get("attributes")).put("pkce.code.challenge.method", "plain");
    assertEquals(204, put(stack.adminUrl() + "/clients/" + id, weakened).statusCode());
    assertEquals("plain", client("steward").get("attributes").get("pkce.code.challenge.method").asText());

    stack.reapplyRealm();

    assertEquals("S256", client("steward").get("attributes").get("pkce.code.challenge.method").asText());
  }

  private JsonNode realm() throws IOException, InterruptedException {
    return get(stack.adminUrl());
  }

  private JsonNode client(String clientId) throws IOException, InterruptedException {
    JsonNode found = get(stack.adminUrl() + "/clients?clientId=" + clientId);
    assertEquals(1, found.size(), "one client named " + clientId);
    return found.get(0);
  }

  private JsonNode get(String url) throws IOException, InterruptedException {
    HttpResponse<String> response =
        HTTP.send(
            HttpRequest.newBuilder(URI.create(url)).header("Authorization", "Bearer " + adminToken).GET().build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode(), response.body());
    return JSON.readTree(response.body());
  }

  private HttpResponse<String> put(String url, JsonNode body) throws IOException, InterruptedException {
    return HTTP.send(
        HttpRequest.newBuilder(URI.create(url))
            .header("Authorization", "Bearer " + adminToken)
            .header("Content-Type", "application/json")
            .PUT(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  /** The bootstrap admin, through the master realm's admin-cli: what the Admin UI itself uses. */
  private String adminToken() throws IOException, InterruptedException {
    String form =
        "grant_type=password&client_id=admin-cli&username=admin&password="
            + URLEncoder.encode(stack.adminPassword, StandardCharsets.UTF_8);
    HttpResponse<String> response =
        HTTP.send(
            HttpRequest.newBuilder(URI.create(stack.masterTokenUrl()))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode(), response.body());
    return JSON.readTree(response.body()).get("access_token").asText();
  }
}
