package com.decionis.kloakware.migration;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The admin API of one realm, as the migration uses it: a token from the
 * master realm, as the pipeline's service account (client credentials) or
 * as the administrator for a first run, and JSON in and out. HTTP/1.1, as
 * every client in this repository that learned the lesson about h2c.
 */
public final class AdminApi {

  private final HttpClient http =
      HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
  private final String baseUrl;
  private final String realm;
  private String token;
  private final Map<String, String> login;

  private AdminApi(String baseUrl, String realm, Map<String, String> login) {
    this.baseUrl = baseUrl.replaceAll("/+$", "");
    this.realm = realm;
    this.login = login;
  }

  /** As the kloakware-ci service account in the master realm (K11): the pipeline's way. */
  public static AdminApi asServiceAccount(String baseUrl, String realm, String clientId, String secret) {
    return new AdminApi(
        baseUrl,
        realm,
        Map.of("grant_type", "client_credentials", "client_id", clientId, "client_secret", secret));
  }

  /** As the administrator: the first run of an environment, or a laptop. */
  public static AdminApi asAdministrator(String baseUrl, String realm, String username, String password) {
    return new AdminApi(
        baseUrl,
        realm,
        Map.of("grant_type", "password", "client_id", "admin-cli", "username", username, "password", password));
  }

  public String realm() {
    return realm;
  }

  String token() throws IOException, InterruptedException {
    if (token != null) return token;
    HttpResponse<String> response =
        http.send(
            HttpRequest.newBuilder(URI.create(baseUrl + "/realms/master/protocol/openid-connect/token"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form(login)))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() != 200) {
      throw new IOException("the admin API refused the sign-in: " + response.statusCode() + " " + response.body());
    }
    token = Export.JSON.readTree(response.body()).get("access_token").asText();
    return token;
  }

  /** A request under /admin/realms/{realm}; the path starts with a slash. */
  public HttpResponse<String> send(String method, String path, Object json)
      throws IOException, InterruptedException {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(baseUrl + "/admin/realms/" + realm + path))
            .header("Authorization", "Bearer " + token());
    if (json == null) {
      request.method(method, HttpRequest.BodyPublishers.noBody());
    } else {
      request
          .header("Content-Type", "application/json")
          .method(method, HttpRequest.BodyPublishers.ofString(Export.JSON.writeValueAsString(json)));
    }
    HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() == 401) {
      // The token aged out mid-run: once more with a fresh one.
      token = null;
      request.setHeader("Authorization", "Bearer " + token());
      response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    return response;
  }

  public JsonNode get(String path) throws IOException, InterruptedException {
    HttpResponse<String> response = send("GET", path, null);
    if (response.statusCode() != 200) {
      throw new IOException("GET " + path + ": " + response.statusCode() + " " + response.body());
    }
    return Export.JSON.readTree(response.body());
  }

  static String form(Map<String, String> fields) {
    return fields.entrySet().stream()
        .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
        .collect(Collectors.joining("&"));
  }

  public static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
