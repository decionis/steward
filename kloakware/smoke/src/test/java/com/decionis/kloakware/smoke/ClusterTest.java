package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Two nodes, one cluster, one address: discovered through jdbc-ping in the
 * shared database, each reporting a cluster of two; a realm applied through
 * the proxy served by each node on its own; and sessions issued under
 * round-robin, one by each node, both refreshed after the second node is
 * gone, which is what persistent user sessions (the default since 26) buy:
 * nothing to be sticky about once a user is signed in.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ClusterTest {

  private static final Pattern CLUSTER_SIZE = Pattern.compile("(?m)^vendor_cluster_size(?:\\{[^}]*\\})? (\\d+)");

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void twoNodesReportOneClusterOfTwo() throws Exception {
    assertEquals(2, clusterSize(stack.managementUrl()), "the first node sees both");
    assertEquals(2, clusterSize(stack.secondManagementUrl()), "so does the second");
  }

  @Test
  void aRealmAppliedThroughTheProxyIsServedByEachNode() throws Exception {
    for (String base : new String[] {stack.firstBaseUrl(), stack.secondBaseUrl()}) {
      HttpResponse<String> discovery =
          Tokens.HTTP.send(
              HttpRequest.newBuilder(URI.create(base + "/realms/steward/.well-known/openid-configuration")).GET().build(),
              HttpResponse.BodyHandlers.ofString());
      assertEquals(200, discovery.statusCode(), discovery.body());
      JsonNode body = Tokens.JSON.readTree(discovery.body());
      assertTrue(body.get("issuer").asText().startsWith(base), "its own address as the issuer: " + body.get("issuer"));
    }
  }

  @Test
  void sessionsOutliveTheNodeThatIssuedThem() throws Exception {
    // Two sign-ins through the proxy: round-robin gives one to each node.
    String first = grant().get("refresh_token").asText();
    String second = grant().get("refresh_token").asText();

    stack.second(false);
    try {
      // Both refreshed with the second node gone: the sessions are in the
      // database, not only in the memory of the node that made them, and the
      // proxy sends a request that cannot reach a node to the other.
      assertEquals(200, refresh(first).statusCode(), "the first session");
      assertEquals(200, refresh(second).statusCode(), "the second session");
      assertEquals(1, clusterSize(stack.managementUrl()), "the survivor sees itself alone");
    } finally {
      stack.second(true);
    }
    // Back, as a new container at a new address, and the cluster is two again.
    int size = 0;
    for (int attempt = 0; attempt < 60 && size != 2; attempt++) {
      Thread.sleep(1000);
      size = clusterSize(stack.managementUrl());
    }
    assertEquals(2, size, "the second node joined again");
  }

  private JsonNode grant() throws IOException, InterruptedException {
    return Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
  }

  private HttpResponse<String> refresh(String refreshToken) throws IOException, InterruptedException {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "refresh_token");
    form.put("client_id", "kloakware-smoke");
    form.put("refresh_token", refreshToken);
    HttpResponse<String> response = Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", form, null);
    assertEquals(200, response.statusCode(), response.body());
    return response;
  }

  /** The cluster size as the node's own metrics report it. */
  static int clusterSize(String managementUrl) throws IOException, InterruptedException {
    HttpResponse<String> metrics =
        Tokens.HTTP.send(HttpRequest.newBuilder(URI.create(managementUrl + "/metrics")).GET().build(), HttpResponse.BodyHandlers.ofString());
    assertEquals(200, metrics.statusCode());
    Matcher size = CLUSTER_SIZE.matcher(metrics.body());
    assertTrue(size.find(), "vendor_cluster_size is reported: " + metrics.body().lines().filter(l -> l.contains("cluster")).findFirst().orElse("(no cluster metric)"));
    return Integer.parseInt(size.group(1));
  }
}
