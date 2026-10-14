package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The admin API behind a least-privilege service account (K11): kloakware-ci
 * in the master realm, client credentials, with the steward and corp realms'
 * management roles and nothing of master's. It applies the realm files the
 * way the promotion pipeline does, and it cannot read master's users or
 * create a realm.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ServiceAccountAdminTest {

  private KloakwareStack stack;
  private String ci;

  @BeforeAll
  void useTheSharedStack() throws Exception {
    stack = SharedStack.get();
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "client_credentials");
    form.put("client_id", "kloakware-ci");
    form.put("client_secret", stack.ciClientSecret);
    HttpResponse<String> response = Tokens.postForm(stack.masterTokenUrl(), form, null);
    assertEquals(200, response.statusCode(), response.body());
    ci = Tokens.JSON.readTree(response.body()).get("access_token").asText();
  }

  @Test
  void theServiceAccountReadsTheRealmItManagesAndNothingOfMaster() throws Exception {
    assertEquals(200, send("GET", stack.adminUrl() + "/clients").statusCode());
    assertEquals(200, send("GET", stack.baseUrl() + "/admin/realms/corp/clients").statusCode());
    assertEquals(403, send("GET", stack.baseUrl() + "/admin/realms/master/users").statusCode());
    assertEquals(403, send("GET", stack.baseUrl() + "/admin/realms/master/clients").statusCode());
    HttpResponse<String> created =
        Tokens.HTTP.send(
            HttpRequest.newBuilder(URI.create(stack.baseUrl() + "/admin/realms"))
                .header("Authorization", "Bearer " + ci)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"realm\":\"intruder\",\"enabled\":true}"))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(403, created.statusCode(), created.body());
  }

  @Test
  void theRealmFilesConvergeWhenAppliedAsTheServiceAccount() {
    // Throws when config-cli exits non-zero: the account has what the files need.
    stack.applyRealmAsCi();
  }

  private HttpResponse<String> send(String method, String url) throws Exception {
    return Tokens.HTTP.send(
        HttpRequest.newBuilder(URI.create(url))
            .header("Authorization", "Bearer " + ci)
            .method(method, HttpRequest.BodyPublishers.noBody())
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }
}
