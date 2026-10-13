package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The sign-in Steward will perform, driven through the realm's own login page:
 * the Authorization Code flow with PKCE for the confidential {@code steward}
 * client, through the custom browser flow the realm binds. Proves the realm
 * refuses a request without PKCE and one with a redirect URI it does not know.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BrowserSignInTest {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String CLIENT = "steward";
  private static final String REDIRECT = KloakwareStack.STEWARD_URL + "/api/auth/oidc/callback";
  private static final Pattern FORM_ACTION = Pattern.compile("<form[^>]*action=\"([^\"]+)\"");

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void theOperatorSignsInThroughTheLoginPageWithPkce() throws Exception {
    HttpClient browser = newBrowser();
    String verifier = randomUrlSafe(48);
    String state = randomUrlSafe(16);
    String nonce = randomUrlSafe(16);

    // 1. The authorisation request: the realm answers with its login page.
    HttpResponse<String> page =
        browser.send(
            HttpRequest.newBuilder(URI.create(authorizationUrl(verifier, state, nonce))).GET().build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, page.statusCode(), page.body());
    Matcher action = FORM_ACTION.matcher(page.body());
    assertTrue(action.find(), "the login page carries a form");
    String formAction = action.group(1).replace("&amp;", "&");

    // 2. The credentials, posted where the page says: a redirect back to Steward with a code.
    Map<String, String> credentials = new LinkedHashMap<>();
    credentials.put("username", KloakwareStack.DEV_USER);
    credentials.put("password", stack.devUserPassword);
    credentials.put("credentialId", "");
    HttpResponse<String> redirect = postForm(browser, formAction, credentials);
    assertEquals(302, redirect.statusCode(), redirect.body());
    URI location = URI.create(redirect.headers().firstValue("Location").orElseThrow());
    assertTrue(location.toString().startsWith(REDIRECT + "?"), location.toString());
    Map<String, String> query = query(location);
    assertEquals(state, query.get("state"));
    String code = query.get("code");
    assertTrue(code != null && !code.isEmpty(), "a code came back");

    // 3. The code for tokens, on the server side: the secret and the verifier.
    Map<String, String> exchange = new LinkedHashMap<>();
    exchange.put("grant_type", "authorization_code");
    exchange.put("code", code);
    exchange.put("redirect_uri", REDIRECT);
    exchange.put("client_id", CLIENT);
    exchange.put("client_secret", stack.clientSecret);
    exchange.put("code_verifier", verifier);
    HttpResponse<String> tokens =
        postForm(browser, stack.realmUrl() + "/protocol/openid-connect/token", exchange);
    assertEquals(200, tokens.statusCode(), tokens.body());
    JsonNode body = JSON.readTree(tokens.body());

    JsonNode id = claims(body.get("id_token").asText());
    assertEquals(nonce, id.get("nonce").asText(), "the nonce round-trips");
    assertEquals(CLIENT, id.get("aud").asText(), "the ID token is for Steward");
    assertEquals(stack.realmUrl(), id.get("iss").asText());
    assertTrue(id.hasNonNull("sid"), "a session id, for backchannel logout");
    assertEquals("Erin", id.get("given_name").asText());

    JsonNode access = claims(body.get("access_token").asText());
    assertTrue(has(access.path("steward").path("roles"), "admin"));
    assertTrue(has(access.path("steward").path("markets"), "SE"));
    assertTrue(access.get("name") == null, "a lightweight access token carries no profile");
    assertEquals(300, body.get("expires_in").asInt());
  }

  @Test
  void aRequestWithoutPkceIsRefused() throws Exception {
    HttpClient browser = newBrowser();
    String url =
        stack.realmUrl()
            + "/protocol/openid-connect/auth?"
            + form(
                Map.of(
                    "client_id", CLIENT,
                    "response_type", "code",
                    "scope", "openid",
                    "redirect_uri", REDIRECT,
                    "state", randomUrlSafe(8)));
    HttpResponse<String> response =
        browser.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString());
    assertNotEquals(200, response.statusCode(), "no login page without a code challenge");
    assertTrue(FORM_ACTION.matcher(response.body()).find() == false, "no form to fill");
  }

  @Test
  void aRedirectUriTheRealmDoesNotKnowIsRefused() throws Exception {
    HttpClient browser = newBrowser();
    String url =
        authorizationUrl(randomUrlSafe(48), randomUrlSafe(8), randomUrlSafe(8))
            .replace(encode(REDIRECT), encode("https://attacker.example/callback"));
    HttpResponse<String> response =
        browser.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString());
    assertEquals(400, response.statusCode());
    assertTrue(FORM_ACTION.matcher(response.body()).find() == false, "no form to fill");
  }

  private String authorizationUrl(String verifier, String state, String nonce)
      throws NoSuchAlgorithmException {
    Map<String, String> query = new LinkedHashMap<>();
    query.put("client_id", CLIENT);
    query.put("response_type", "code");
    query.put("scope", "openid");
    query.put("redirect_uri", REDIRECT);
    query.put("state", state);
    query.put("nonce", nonce);
    query.put("code_challenge", challenge(verifier));
    query.put("code_challenge_method", "S256");
    return stack.realmUrl() + "/protocol/openid-connect/auth?" + form(query);
  }

  /** A browser: keeps cookies as a browser on a trustworthy origin does, follows nothing. */
  private static HttpClient newBrowser() {
    return HttpClient.newBuilder()
        .cookieHandler(new TrustingCookieJar())
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  private static HttpResponse<String> postForm(HttpClient client, String url, Map<String, String> fields)
      throws IOException, InterruptedException {
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form(fields)))
            .build();
    return client.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private static String challenge(String verifier) throws NoSuchAlgorithmException {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
    return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
  }

  private static String randomUrlSafe(int bytes) {
    byte[] random = new byte[bytes];
    new SecureRandom().nextBytes(random);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
  }

  private static Map<String, String> query(URI uri) {
    Map<String, String> values = new LinkedHashMap<>();
    for (String pair : uri.getRawQuery().split("&")) {
      int at = pair.indexOf('=');
      values.put(decode(pair.substring(0, at)), decode(pair.substring(at + 1)));
    }
    return values;
  }

  private static String form(Map<String, String> fields) {
    return fields.entrySet().stream()
        .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
        .collect(Collectors.joining("&"));
  }

  private static JsonNode claims(String jwt) throws IOException {
    return JSON.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
  }

  private static boolean has(JsonNode array, String value) {
    for (JsonNode element : array) if (value.equals(element.asText())) return true;
    return false;
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private static String decode(String value) {
    return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
  }
}
