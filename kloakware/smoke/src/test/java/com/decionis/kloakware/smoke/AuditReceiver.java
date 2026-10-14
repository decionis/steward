package com.decionis.kloakware.smoke;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Steward's activities endpoint, as the audit listener sees it: an HTTP
 * server in the test JVM that keeps every record it receives with the
 * headers the listener signed it with. The test verifies the signature the
 * way Steward does.
 */
final class AuditReceiver {

  record Received(String timestamp, String signature, String body) {}

  private final List<Received> received = new CopyOnWriteArrayList<>();
  /** The logout tokens the backchannel logout endpoint received (K11), as posted. */
  private final List<String> logoutTokens = new CopyOnWriteArrayList<>();
  private HttpServer server;

  void start() {
    try {
      server = HttpServer.create(new InetSocketAddress("0.0.0.0", 0), 0);
    } catch (IOException error) {
      throw new IllegalStateException("The audit receiver could not bind", error);
    }
    server.createContext(
        "/api/activities/kloakware",
        exchange -> {
          // As strict as Steward's server: Next.js ends a request that asks
          // for a protocol upgrade (the Java client's default h2c offer)
          // without answering it, so this receiver does the same.
          if (exchange.getRequestHeaders().containsKey("Upgrade")) {
            exchange.close();
            return;
          }
          String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
          received.add(
              new Received(
                  exchange.getRequestHeaders().getFirst("x-steward-timestamp"),
                  exchange.getRequestHeaders().getFirst("x-steward-signature"),
                  body));
          byte[] answer = "{\"recorded\":true}".getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().add("content-type", "application/json");
          exchange.sendResponseHeaders(202, answer.length);
          exchange.getResponseBody().write(answer);
          exchange.close();
        });
    // Steward's backchannel logout endpoint (K3), as the revocation test
    // points the steward client at it: the logout token, kept.
    server.createContext(
        "/api/auth/oidc/backchannel-logout",
        exchange -> {
          if (exchange.getRequestHeaders().containsKey("Upgrade")) {
            exchange.close();
            return;
          }
          String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
          for (String pair : body.split("&")) {
            if (pair.startsWith("logout_token=")) {
              logoutTokens.add(
                  java.net.URLDecoder.decode(pair.substring("logout_token=".length()), StandardCharsets.UTF_8));
            }
          }
          exchange.sendResponseHeaders(200, -1);
          exchange.close();
        });
    server.start();
  }

  int port() {
    return server.getAddress().getPort();
  }

  List<Received> received() {
    return received;
  }

  /** The first record of this type naming this user that arrives within the wait, or null. */
  Received await(String type, String username, long millis) throws InterruptedException {
    long deadline = System.currentTimeMillis() + millis;
    while (System.currentTimeMillis() < deadline) {
      for (Received record : received) {
        if (record.body().contains("\"type\":\"" + type + "\"")
            && record.body().contains("\"username\":\"" + username + "\"")) {
          return record;
        }
      }
      Thread.sleep(200);
    }
    return null;
  }

  /** The first logout token naming this session that arrives within the wait, or null. */
  String awaitLogoutToken(String sid, long millis) throws InterruptedException {
    long deadline = System.currentTimeMillis() + millis;
    while (System.currentTimeMillis() < deadline) {
      for (String token : logoutTokens) {
        if (token.split("\\.").length == 3) {
          String claims =
              new String(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
          if (claims.contains("\"sid\":\"" + sid + "\"")) return token;
        }
      }
      Thread.sleep(200);
    }
    return null;
  }

  void stop() {
    if (server != null) server.stop(0);
  }
}
