package com.decionis.kloakware.mfa;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.keycloak.util.JsonSerialization;

/**
 * The shape of the Swedish BankID Relying Party API, version 6: start an
 * order, collect its status until it completes, read who signed. Against the
 * real API the transport is mutual TLS with the RP certificate and the
 * personal number is never sent, only required; against the simulator in
 * the compose file it is plain HTTP. What the authenticator does with the
 * answer is the same in both cases.
 */
public final class BankIdClient {

  public record Order(String orderRef, String autoStartToken) {}

  public record Collect(String status, String hintCode, String personalNumber, String name) {
    public boolean complete() {
      return "complete".equals(status);
    }

    public boolean failed() {
      return "failed".equals(status);
    }
  }

  private final URI base;
  private final HttpClient client;

  public BankIdClient(String baseUrl) {
    this.base = URI.create(baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
    this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  }

  public Order auth(String endUserIp, String personalNumber) throws IOException, InterruptedException {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("endUserIp", endUserIp);
    if (personalNumber != null) body.put("requirement", Map.of("personalNumber", personalNumber));
    Map<?, ?> answer = post("/rp/v6.0/auth", body);
    return new Order(text(answer, "orderRef"), text(answer, "autoStartToken"));
  }

  public Collect collect(String orderRef) throws IOException, InterruptedException {
    Map<?, ?> answer = post("/rp/v6.0/collect", Map.of("orderRef", orderRef));
    Map<?, ?> completion = answer.get("completionData") instanceof Map<?, ?> m ? m : Map.of();
    Map<?, ?> user = completion.get("user") instanceof Map<?, ?> m ? m : Map.of();
    return new Collect(text(answer, "status"), text(answer, "hintCode"), text(user, "personalNumber"), text(user, "name"));
  }

  public void cancel(String orderRef) {
    try {
      post("/rp/v6.0/cancel", Map.of("orderRef", orderRef));
    } catch (Exception ignored) {
      // A cancel that fails leaves an order to expire on its own.
    }
  }

  private Map<?, ?> post(String path, Map<String, Object> body) throws IOException, InterruptedException {
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(base + path))
            .timeout(Duration.ofSeconds(10))
            .header("content-type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(JsonSerialization.writeValueAsString(body)))
            .build();
    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() >= 300) {
      throw new IOException("BankID " + path + " answered " + response.statusCode());
    }
    return JsonSerialization.readValue(response.body(), Map.class);
  }

  private static String text(Map<?, ?> map, String key) {
    Object value = map.get(key);
    return value == null ? null : value.toString();
  }
}
