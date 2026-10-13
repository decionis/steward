package com.decionis.kloakware.audit;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.jboss.logging.Logger;

/**
 * Posts each record to Steward's activities endpoint, signed. Called from
 * the outlet's own thread, never from a request thread; a failure is logged
 * and the record is kept on standard output by the sink beside this one.
 */
public final class HttpAuditSink implements AuditSink {

  private static final Logger LOG = Logger.getLogger(HttpAuditSink.class);

  private final URI url;
  private final String secret;
  private final HttpClient client;

  public HttpAuditSink(String url, String secret) {
    this.url = URI.create(url);
    this.secret = secret;
    // HTTP/1.1 outright: the client's default asks to upgrade a cleartext
    // request to h2c, and Next.js's production server ends any request that
    // carries an Upgrade header without answering it.
    this.client =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
  }

  /** The start of a response body, enough to say why the endpoint refused a record. */
  static String excerpt(String body) {
    if (body == null || body.isBlank()) return "(no body)";
    String line = body.strip().replaceAll("\\s+", " ");
    return line.length() <= 200 ? line : line.substring(0, 200) + "…";
  }

  @Override
  public void publish(AuditEvent event) {
    String body = event.toJson();
    String timestamp = Long.toString(System.currentTimeMillis());
    HttpRequest request =
        HttpRequest.newBuilder(url)
            .timeout(Duration.ofSeconds(10))
            .header("content-type", "application/json")
            .header("x-steward-timestamp", timestamp)
            .header("x-steward-signature", AuditEvent.signature(secret, timestamp, body))
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
    try {
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() >= 300) {
        LOG.warnf(
            "Steward's activities endpoint answered %d to a %s event: %s",
            response.statusCode(), event.type(), excerpt(response.body()));
      }
    } catch (Exception error) {
      LOG.warnf("Steward's activities endpoint could not be reached for a %s event: %s", event.type(), error);
    }
  }
}
