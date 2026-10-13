package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
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
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Identity brokering: Steward's sign-in starts at the steward realm, the
 * person picks the corporate sign-in, authenticates in the corp realm (the
 * stand-in for Entra ID or Google), and comes back with the market and the
 * role Corp states. A new email becomes a new account; a known email is
 * linked to the account that has it, which is what the first-login flow
 * decides. Over OpenID Connect and over SAML, each driven as a browser.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BrokeredSignInTest {

  private static final String CLIENT = "steward";
  private static final String REDIRECT = KloakwareStack.STEWARD_URL + "/api/auth/oidc/callback";
  private static final Pattern FORM_ACTION = Pattern.compile("<form[^>]*action=\"([^\"]+)\"");
  private static final Pattern INPUT = Pattern.compile("<input[^>]*>");
  private static final Pattern ATTRIBUTE = Pattern.compile("(name|value)=\"([^\"]*)\"");

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void aNewPersonFromCorpArrivesWithTheirMarketAndRoleOverOpenIdConnect() throws Exception {
    JsonNode access = signInThrough("corp", "carl.corp");
    assertEquals("carl@corp.test", access.get("email").asText());
    assertTrue(has(access.path("steward").path("markets"), "SE"), access.toString());
    assertTrue(has(access.path("steward").path("roles"), "operator"), access.toString());

    String admin = Admin.token(stack);
    JsonNode carl = Admin.user(stack, admin, "carl.corp");
    JsonNode identities = Admin.get(stack, admin, "/users/" + carl.get("id").asText() + "/federated-identity");
    assertEquals("corp", identities.get(0).get("identityProvider").asText(), identities.toString());
  }

  @Test
  void aKnownEmailIsLinkedToTheAccountThatHasIt() throws Exception {
    String admin = Admin.token(stack);
    String erinId = Admin.user(stack, admin, KloakwareStack.DEV_USER).get("id").asText();

    JsonNode access = signInThrough("corp", "erin.corp");
    assertEquals(erinId, access.get("sub").asText(), "erin.corp signed in as erin.example");
    // Corp is the source: with sync mode FORCE its statements replace what
    // was granted by hand, so the admin role erin.example held is gone and
    // the approver role Corp states is there.
    assertTrue(has(access.path("steward").path("roles"), "approver"), access.toString());
    assertTrue(!has(access.path("steward").path("roles"), "admin"), "Corp does not state admin: " + access);
    assertTrue(has(access.path("steward").path("markets"), "DE"), access.toString());

    JsonNode identities = Admin.get(stack, admin, "/users/" + erinId + "/federated-identity");
    assertTrue(
        identities.toString().contains("\"identityProvider\":\"corp\""), "linked, not duplicated: " + identities);
    JsonNode byEmail = Admin.get(stack, admin, "/users?email=erin%40example.test&exact=true");
    assertEquals(1, byEmail.size(), "still one account with that email: " + byEmail);
  }

  @Test
  void theSamlBrokerDoesTheSameWithAssertions() throws Exception {
    JsonNode access = signInThrough("corp-saml", "dana.corp");
    assertEquals("dana@corp.test", access.get("email").asText());
    assertTrue(has(access.path("steward").path("markets"), "GB"), access.toString());
    assertTrue(has(access.path("steward").path("roles"), "audits"), access.toString());

    String admin = Admin.token(stack);
    // A SAML broker names the user after the assertion's subject, the email.
    JsonNode byEmail = Admin.get(stack, admin, "/users?email=dana%40corp.test&exact=true");
    assertEquals(1, byEmail.size(), byEmail.toString());
    JsonNode identities = Admin.get(stack, admin, "/users/" + byEmail.get(0).get("id").asText() + "/federated-identity");
    assertEquals("corp-saml", identities.get(0).get("identityProvider").asText(), identities.toString());
  }

  /**
   * The browser's path: Steward's authorisation request, the broker's link
   * on the login page, Corp's login page, the credentials, then back through
   * the broker's endpoint and the first-login flow to Steward with a code,
   * which is exchanged as Steward would. Returns the access token's claims.
   */
  private JsonNode signInThrough(String broker, String corpUser) throws Exception {
    HttpClient browser =
        HttpClient.newBuilder().cookieHandler(new TrustingCookieJar()).followRedirects(HttpClient.Redirect.NEVER).build();
    String verifier = randomUrlSafe(48);
    String state = randomUrlSafe(16);

    HttpResponse<String> login = get(browser, authorizationUrl(verifier, state));
    assertEquals(200, login.statusCode(), login.body());
    Matcher link = Pattern.compile("href=\"([^\"]*broker/" + broker + "/login[^\"]*)\"").matcher(login.body());
    assertTrue(link.find(), "the login page offers the " + broker + " sign-in");

    // The broker sends the browser to Corp: a redirect for OpenID Connect, an
    // auto-submitting form for SAML with POST binding.
    String href = link.group(1).replace("&amp;", "&");
    HttpResponse<String> toCorp = get(browser, href.startsWith("/") ? stack.baseUrl() + href : href);
    HttpResponse<String> corpLogin;
    if (isRedirect(toCorp)) {
      corpLogin = get(browser, toCorp.headers().firstValue("Location").orElseThrow());
    } else {
      assertEquals(200, toCorp.statusCode(), toCorp.body());
      corpLogin = postForm(browser, action(toCorp.body()), hiddenInputs(toCorp.body()));
    }
    // Corp may answer the request with a redirect to its login page.
    for (int hop = 0; hop < 3 && isRedirect(corpLogin); hop++) {
      corpLogin = get(browser, corpLogin.headers().firstValue("Location").orElseThrow());
    }
    assertEquals(200, corpLogin.statusCode(), corpLogin.body());
    assertTrue(corpLogin.body().contains("/realms/corp/"), "Corp's login page");

    Map<String, String> credentials = new LinkedHashMap<>();
    credentials.put("username", corpUser);
    credentials.put("password", stack.devUserPassword);
    credentials.put("credentialId", "");
    HttpResponse<String> fromCorp = postForm(browser, action(corpLogin.body()), credentials);

    // Back to the steward realm's broker endpoint: by redirect, or by posting
    // the assertion the auto-submitting form carries.
    HttpResponse<String> next;
    if (isRedirect(fromCorp)) {
      next = get(browser, fromCorp.headers().firstValue("Location").orElseThrow());
    } else {
      assertEquals(200, fromCorp.statusCode(), fromCorp.body());
      next = postForm(browser, action(fromCorp.body()), hiddenInputs(fromCorp.body()));
    }

    // The first-login flow may take a hop or two within the realm before the
    // redirect to Steward with the code.
    for (int hop = 0; hop < 8 && isRedirect(next); hop++) {
      String location = next.headers().firstValue("Location").orElseThrow();
      if (location.startsWith(REDIRECT + "?")) {
        Map<String, String> query = query(URI.create(location));
        assertEquals(state, query.get("state"));
        return exchange(browser, query.get("code"), verifier);
      }
      next = get(browser, location);
    }
    throw new AssertionError("no redirect to Steward; last answer " + next.statusCode() + ": " + excerpt(next.body()));
  }

  private JsonNode exchange(HttpClient browser, String code, String verifier) throws Exception {
    assertNotNull(code, "a code came back");
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "authorization_code");
    form.put("code", code);
    form.put("redirect_uri", REDIRECT);
    form.put("client_id", CLIENT);
    form.put("client_secret", stack.clientSecret);
    form.put("code_verifier", verifier);
    HttpResponse<String> tokens = postForm(browser, stack.realmUrl() + "/protocol/openid-connect/token", form);
    assertEquals(200, tokens.statusCode(), tokens.body());
    // The ID token: the steward client's access token is lightweight and names no profile.
    return Tokens.claims(Tokens.JSON.readTree(tokens.body()).get("id_token").asText());
  }

  private String authorizationUrl(String verifier, String state) throws Exception {
    return stack.realmUrl()
        + "/protocol/openid-connect/auth?response_type=code&client_id=" + CLIENT
        + "&redirect_uri=" + Tokens.encode(REDIRECT)
        + "&scope=openid&state=" + state
        + "&code_challenge=" + challenge(verifier) + "&code_challenge_method=S256";
  }

  /** 302 or 303: the broker uses both. */
  private static boolean isRedirect(HttpResponse<String> response) {
    return response.statusCode() == 302 || response.statusCode() == 303;
  }

  private static HttpResponse<String> get(HttpClient client, String url) throws IOException, InterruptedException {
    return client.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString());
  }

  private static HttpResponse<String> postForm(HttpClient client, String url, Map<String, String> fields)
      throws IOException, InterruptedException {
    String body =
        fields.entrySet().stream()
            .map(e -> Tokens.encode(e.getKey()) + "=" + Tokens.encode(e.getValue()))
            .collect(Collectors.joining("&"));
    return client.send(
        HttpRequest.newBuilder(URI.create(url))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  private static String action(String html) {
    Matcher action = FORM_ACTION.matcher(html);
    assertTrue(action.find(), "a form on the page: " + excerpt(html));
    return action.group(1).replace("&amp;", "&");
  }

  /** The hidden inputs of an auto-submitting form, SAMLRequest or SAMLResponse with its RelayState. */
  private static Map<String, String> hiddenInputs(String html) {
    Map<String, String> fields = new LinkedHashMap<>();
    Matcher input = INPUT.matcher(html);
    while (input.find()) {
      String name = null;
      String value = null;
      Matcher attribute = ATTRIBUTE.matcher(input.group());
      while (attribute.find()) {
        if ("name".equals(attribute.group(1))) name = attribute.group(2);
        else value = attribute.group(2);
      }
      if (name != null && value != null) fields.put(name, unescape(value));
    }
    assertTrue(!fields.isEmpty(), "hidden inputs on the page: " + excerpt(html));
    return fields;
  }

  private static String unescape(String value) {
    return value.replace("&#43;", "+").replace("&#61;", "=").replace("&#47;", "/").replace("&amp;", "&").replace("&quot;", "\"");
  }

  private static Map<String, String> query(URI uri) {
    Map<String, String> query = new LinkedHashMap<>();
    for (String pair : uri.getRawQuery().split("&")) {
      String[] kv = pair.split("=", 2);
      query.put(kv[0], URLDecoder.decode(kv.length > 1 ? kv[1] : "", StandardCharsets.UTF_8));
    }
    return query;
  }

  private static String challenge(String verifier) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
    return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
  }

  private static String randomUrlSafe(int bytes) {
    byte[] random = new byte[bytes];
    new SecureRandom().nextBytes(random);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
  }

  /** What the page says, when it is one of Keycloak's: the error or the instruction, else its start. */
  private static String excerpt(String body) {
    if (body == null) return "";
    Matcher message =
        Pattern.compile("(?:kc-error-message\"[^>]*>\\s*<p[^>]*>|class=\"instruction\">|kc-feedback-text\"[^>]*>)\\s*([^<]+)")
            .matcher(body);
    StringBuilder said = new StringBuilder();
    while (message.find()) said.append(message.group(1).strip()).append(" | ");
    return said.length() > 0 ? said.toString() : body.length() <= 400 ? body : body.substring(0, 400) + "…";
  }

  private static boolean has(JsonNode array, String value) {
    for (JsonNode item : array) if (value.equals(item.asText())) return true;
    return false;
  }
}
