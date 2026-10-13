package com.decionis.kloakware.smoke;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/** The token endpoint, as the tests use it: password grants for the dev clients, and the claims of what comes back. */
final class Tokens {

  static final HttpClient HTTP = HttpClient.newHttpClient();
  static final ObjectMapper JSON = new ObjectMapper();

  private Tokens() {}

  static JsonNode passwordGrant(KloakwareStack stack, String clientId, String username, String password)
      throws IOException, InterruptedException {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "password");
    form.put("client_id", clientId);
    form.put("username", username);
    form.put("password", password);
    form.put("scope", "openid");
    HttpResponse<String> response = postForm(stack.realmUrl() + "/protocol/openid-connect/token", form, null);
    if (response.statusCode() != 200) {
      throw new IllegalStateException("password grant for " + username + " via " + clientId + ": " + response.body());
    }
    return JSON.readTree(response.body());
  }

  static HttpResponse<String> postForm(String url, Map<String, String> form, String bearer)
      throws IOException, InterruptedException {
    String body =
        form.entrySet().stream()
            .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
            .collect(Collectors.joining("&"));
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body));
    if (bearer != null) request.header("Authorization", "Bearer " + bearer);
    return HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  /** The claims of a JWT, read without verification: the tests are the issuer's own clients. */
  static JsonNode claims(String jwt) throws IOException {
    return JSON.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
  }

  static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
