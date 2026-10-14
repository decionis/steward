package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The market second factor compiled into the server, in the browser flow:
 * Sven works SE, so after the password the realm shows the BankID page; the
 * first return finds the order pending, the second finds it complete for his
 * personal number, and the code comes back. Erin works DE and is never
 * asked, which BrowserSignInTest proves in two steps.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MarketSecondFactorTest {

  private static final Pattern FORM_ACTION = Pattern.compile("<form[^>]*action=\"([^\"]+)\"");
  private static final String REDIRECT = KloakwareStack.STEWARD_URL + "/api/auth/oidc/callback";

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void aUserInTheBankIdMarketConfirmsInBankIdBeforeTheCodeComesBack() throws Exception {
    HttpClient browser =
        HttpClient.newBuilder().cookieHandler(new TrustingCookieJar()).followRedirects(HttpClient.Redirect.NEVER).build();
    String verifier = randomUrlSafe(48);
    String state = randomUrlSafe(16);

    HttpResponse<String> login = browser.send(HttpRequest.newBuilder(URI.create(authorizationUrl(verifier, state))).GET().build(), HttpResponse.BodyHandlers.ofString());
    assertEquals(200, login.statusCode());
    String loginAction = action(login.body());

    Map<String, String> credentials = new LinkedHashMap<>();
    credentials.put("username", "sven.example");
    credentials.put("password", stack.devUserPassword);
    credentials.put("credentialId", "");
    HttpResponse<String> bankId = postForm(browser, loginAction, credentials);
    assertEquals(200, bankId.statusCode(), "the BankID page, not a redirect: " + bankId.statusCode());
    // In the language the user's market speaks (K14): Swedish for sven; the step's ids are the stable part.
    assertTrue(bankId.body().contains("kc-bankid-form"), "the BankID page");
    assertTrue(bankId.body().contains("kc-bankid-continue"), "with its continue button");

    HttpResponse<String> pending = postForm(browser, action(bankId.body()), Map.of("continue", "1"));
    assertEquals(200, pending.statusCode(), "still pending on the first collect");
    assertTrue(pending.body().contains("kc-bankid-continue"), "still the BankID page: " + pending.body().substring(0, Math.min(400, pending.body().length())));

    HttpResponse<String> done = postForm(browser, action(pending.body()), Map.of("continue", "1"));
    assertEquals(302, done.statusCode(), "complete on the second collect: " + done.body());
    URI location = URI.create(done.headers().firstValue("Location").orElseThrow());
    assertTrue(location.toString().startsWith(REDIRECT + "?"), location.toString());
    String code = query(location).get("code");

    Map<String, String> exchange = new LinkedHashMap<>();
    exchange.put("grant_type", "authorization_code");
    exchange.put("code", code);
    exchange.put("redirect_uri", REDIRECT);
    exchange.put("client_id", "steward");
    exchange.put("client_secret", stack.clientSecret);
    exchange.put("code_verifier", verifier);
    HttpResponse<String> tokens = postForm(browser, stack.realmUrl() + "/protocol/openid-connect/token", exchange);
    assertEquals(200, tokens.statusCode(), tokens.body());
    JsonNode id = Tokens.claims(Tokens.JSON.readTree(tokens.body()).get("id_token").asText());
    assertEquals("sven.example", id.get("preferred_username").asText());
    assertTrue(id.path("steward").path("markets").toString().contains("SE"));
  }

  private String authorizationUrl(String verifier, String state) throws Exception {
    Map<String, String> query = new LinkedHashMap<>();
    query.put("client_id", "steward");
    query.put("response_type", "code");
    query.put("scope", "openid");
    query.put("redirect_uri", REDIRECT);
    query.put("state", state);
    query.put("nonce", randomUrlSafe(16));
    query.put("code_challenge", Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes())));
    query.put("code_challenge_method", "S256");
    return stack.realmUrl() + "/protocol/openid-connect/auth?" + form(query);
  }

  private static String action(String html) {
    Matcher matcher = FORM_ACTION.matcher(html);
    assertTrue(matcher.find(), "a form on the page");
    return matcher.group(1).replace("&amp;", "&");
  }

  private static HttpResponse<String> postForm(HttpClient client, String url, Map<String, String> fields) throws IOException, InterruptedException {
    return client.send(
        HttpRequest.newBuilder(URI.create(url)).header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form(fields))).build(),
        HttpResponse.BodyHandlers.ofString());
  }

  private static String form(Map<String, String> fields) {
    StringBuilder out = new StringBuilder();
    fields.forEach((k, v) -> out.append(out.length() == 0 ? "" : "&").append(Tokens.encode(k)).append('=').append(Tokens.encode(v)));
    return out.toString();
  }

  private static Map<String, String> query(URI uri) {
    Map<String, String> values = new LinkedHashMap<>();
    for (String pair : uri.getRawQuery().split("&")) {
      int at = pair.indexOf('=');
      values.put(java.net.URLDecoder.decode(pair.substring(0, at), java.nio.charset.StandardCharsets.UTF_8), java.net.URLDecoder.decode(pair.substring(at + 1), java.nio.charset.StandardCharsets.UTF_8));
    }
    return values;
  }

  private static String randomUrlSafe(int bytes) {
    byte[] random = new byte[bytes];
    new SecureRandom().nextBytes(random);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
  }
}
