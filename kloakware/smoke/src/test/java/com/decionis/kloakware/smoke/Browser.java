package com.decionis.kloakware.smoke;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** The browser the K11 tests drive the login page with, and the small arithmetic of the code flow. */
final class Browser {

  private static final Pattern FORM_ACTION = Pattern.compile("<form[^>]*action=\"([^\"]+)\"");

  private Browser() {}

  /** Keeps cookies as a browser on a trustworthy origin does, follows nothing. */
  static HttpClient newBrowser() {
    return HttpClient.newBuilder()
        .cookieHandler(new TrustingCookieJar())
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  static HttpResponse<String> get(HttpClient client, String url) throws IOException, InterruptedException {
    return get(client, url, Map.of());
  }

  static HttpResponse<String> get(HttpClient client, String url, Map<String, String> headers)
      throws IOException, InterruptedException {
    HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).GET();
    headers.forEach(request::header);
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  static HttpResponse<String> postForm(HttpClient client, String url, Map<String, String> fields)
      throws IOException, InterruptedException {
    return postForm(client, url, fields, Map.of());
  }

  static HttpResponse<String> postForm(
      HttpClient client, String url, Map<String, String> fields, Map<String, String> headers)
      throws IOException, InterruptedException {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form(fields)));
    headers.forEach(request::header);
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  /**
   * Follows redirects that stay under the realm, as a browser would, and
   * returns the first answer that is not one: the page, or the redirect
   * back to the application.
   */
  static HttpResponse<String> followWithinRealm(HttpClient client, HttpResponse<String> response, String realmUrl)
      throws IOException, InterruptedException {
    HttpResponse<String> current = response;
    for (int hops = 0; hops < 5 && (current.statusCode() == 302 || current.statusCode() == 303); hops++) {
      String location = current.headers().firstValue("Location").orElse("");
      if (!location.startsWith(realmUrl)) return current;
      current = get(client, location);
    }
    return current;
  }

  /** Where the page's form posts, with the entities the template escaped undone. */
  static String formAction(String html) {
    Matcher action = FORM_ACTION.matcher(html);
    if (!action.find()) throw new AssertionError("no form on the page: " + html);
    return action.group(1).replace("&amp;", "&");
  }

  /** The same, resolved against the page's origin: the consent page posts to a path. */
  static String formAction(String html, String base) {
    return URI.create(base).resolve(formAction(html)).toString();
  }

  /** The value of a hidden input on the page, or null. */
  static String hiddenInput(String html, String name) {
    Matcher input =
        Pattern.compile("<input[^>]*name=\"" + Pattern.quote(name) + "\"[^>]*value=\"([^\"]*)\"").matcher(html);
    return input.find() ? input.group(1) : null;
  }

  static String challenge(String verifier) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  static String randomUrlSafe(int bytes) {
    byte[] random = new byte[bytes];
    new SecureRandom().nextBytes(random);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
  }

  static Map<String, String> query(URI uri) {
    Map<String, String> values = new LinkedHashMap<>();
    for (String pair : uri.getRawQuery().split("&")) {
      int at = pair.indexOf('=');
      values.put(decode(pair.substring(0, at)), decode(pair.substring(at + 1)));
    }
    return values;
  }

  static String form(Map<String, String> fields) {
    return fields.entrySet().stream()
        .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
        .collect(Collectors.joining("&"));
  }

  static JsonNode claims(String jwt) throws IOException {
    return Tokens.JSON.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
  }

  static JsonNode header(String jwt) throws IOException {
    return Tokens.JSON.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[0]));
  }

  static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  static String decode(String value) {
    return URLDecoder.decode(value, StandardCharsets.UTF_8);
  }
}
