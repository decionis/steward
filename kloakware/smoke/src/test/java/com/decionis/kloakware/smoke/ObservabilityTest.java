package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * What the management port and the standard output say (K10): a sign-in and
 * a failed one show up as user-event metrics with their realm and client,
 * the HTTP histogram exists for a p95, the pool and the JVM report, a log
 * line is JSON, and the collector received spans.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ObservabilityTest {

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void signInsAreCountedByOutcomeRealmAndClient() throws Exception {
    Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    Map<String, String> wrong = new LinkedHashMap<>();
    wrong.put("grant_type", "password");
    wrong.put("client_id", "kloakware-smoke");
    wrong.put("username", KloakwareStack.DEV_USER);
    wrong.put("password", "not-the-password");
    Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", wrong, null);

    // The metrics are per node and the proxy chose one for each request.
    String metrics = metrics(stack.managementUrl()) + "\n" + metrics(stack.secondManagementUrl());
    // A failed login is a login event with its error tag set, not an event
    // of its own; the tags are the realm, the client and the provider.
    assertTrue(
        Pattern.compile("^keycloak_user_events_total\\{client_id=\"kloakware-smoke\",error=\"\",event=\"login\",idp=\"\",realm=\"steward\"\\}", Pattern.MULTILINE).matcher(metrics).find(),
        "a login is counted with its tags: " + excerpt(metrics, "keycloak_user_events"));
    assertTrue(
        Pattern.compile("^keycloak_user_events_total\\{client_id=\"kloakware-smoke\",error=\"invalid_user_credentials\",event=\"login\"", Pattern.MULTILINE).matcher(metrics).find(),
        "a failed login is counted with its error: " + excerpt(metrics, "keycloak_user_events"));
  }

  @Test
  void theManagementPortReportsWhatTheAlertsRead() throws Exception {
    String metrics = metrics(stack.managementUrl());
    for (String family : new String[] {
        "http_server_requests_seconds_bucket", "agroal_blocking_time_average_milliseconds", "agroal_awaiting_count",
        "jvm_gc_pause_seconds", "vendor_cluster_size", "process_cpu_usage"}) {
      assertTrue(metrics.contains("\n" + family) || metrics.startsWith(family), family + " is reported");
    }
  }

  @Test
  void theLogIsJsonAndTheCollectorReceivedSpans() throws Exception {
    String json = stack.serverLogs().lines().filter(l -> l.startsWith("{")).findFirst().orElse(null);
    assertTrue(json != null, "a JSON log line");
    JsonNode line = Tokens.JSON.readTree(json);
    assertTrue(line.hasNonNull("timestamp") && line.hasNonNull("level") && line.hasNonNull("message"), json);

    Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    String spans = null;
    for (int attempt = 0; attempt < 30; attempt++) {
      spans = stack.collectorLogs();
      if (spans.contains("\tTraces\t") || spans.contains("ResourceSpans")) break;
      Thread.sleep(1000);
    }
    assertTrue(spans != null && (spans.contains("\tTraces\t") || spans.contains("ResourceSpans")), "the collector logged spans");
  }

  private static String metrics(String managementUrl) throws Exception {
    HttpResponse<String> response =
        Tokens.HTTP.send(HttpRequest.newBuilder(URI.create(managementUrl + "/metrics")).GET().build(), HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode());
    return response.body();
  }

  private static String excerpt(String metrics, String prefix) {
    return metrics.lines().filter(l -> l.startsWith(prefix)).limit(6).reduce("", (a, b) -> a + "\n" + b);
  }
}
