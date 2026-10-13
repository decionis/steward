package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

/** The admin API of the steward realm, as the bootstrap administrator. */
final class Admin {

  private Admin() {}

  static String token(KloakwareStack stack) throws IOException, InterruptedException {
    String form =
        "grant_type=password&client_id=admin-cli&username=admin&password="
            + URLEncoder.encode(stack.adminPassword, StandardCharsets.UTF_8);
    HttpResponse<String> response =
        Tokens.HTTP.send(
            HttpRequest.newBuilder(URI.create(stack.masterTokenUrl()))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode(), response.body());
    return Tokens.JSON.readTree(response.body()).get("access_token").asText();
  }

  /** A GET under the realm's admin root, expected to answer 200. */
  static JsonNode get(KloakwareStack stack, String token, String path)
      throws IOException, InterruptedException {
    HttpResponse<String> response = send(stack, token, "GET", path, null);
    assertEquals(200, response.statusCode(), path + ": " + response.body());
    return Tokens.JSON.readTree(response.body());
  }

  static HttpResponse<String> send(
      KloakwareStack stack, String token, String method, String path, String json)
      throws IOException, InterruptedException {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(stack.adminUrl() + path))
            .header("Authorization", "Bearer " + token);
    if (json == null) {
      request.method(method, HttpRequest.BodyPublishers.noBody());
    } else {
      request.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(json));
    }
    return Tokens.HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  /** The one user with this username, through the admin API. */
  static JsonNode user(KloakwareStack stack, String token, String username)
      throws IOException, InterruptedException {
    JsonNode users = get(stack, token, "/users?username=" + Tokens.encode(username) + "&exact=true");
    assertEquals(1, users.size(), "one user named " + username + ": " + users);
    return users.get(0);
  }
}
