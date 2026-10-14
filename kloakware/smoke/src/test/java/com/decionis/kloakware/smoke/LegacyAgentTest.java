package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The SiteMinder agent stood in (K13): the legacy dashboard, now an OIDC
 * client, signs its user in through the realm's login page; the shim in
 * front of the application verifies the token and sets the headers the
 * application always read, SM_USER first; and refuses what the agent
 * refused, nothing, a forged signature, a token for another application.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LegacyAgentTest {

  private static final String REDIRECT = "http://localhost:8082/callback";

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void theApplicationBehindTheShimGetsItsHeadersFromTheToken() throws Exception {
    String accessToken = signInAsTheLegacyDashboard();

    HttpResponse<String> echoed = call(accessToken);
    assertEquals(200, echoed.statusCode(), echoed.body());
    assertTrue(echoed.body().contains("SM_USER=" + KloakwareStack.DEV_USER), echoed.body());
    assertTrue(echoed.body().contains("SM_USEREMAIL=erin@example.test"), echoed.body());
    assertTrue(echoed.body().contains("SM_ROLES=") && echoed.body().contains("admin"), echoed.body());
    assertTrue(echoed.body().contains("SM_MARKETS=") && echoed.body().contains("DE"), echoed.body());

    HttpResponse<String> none =
        Tokens.HTTP.send(
            HttpRequest.newBuilder(URI.create(stack.agentBaseUrl() + "/")).GET().build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(401, none.statusCode(), none.body());

    String forged = accessToken.substring(0, accessToken.length() - 4) + "AAAA";
    assertEquals(401, call(forged).statusCode(), "a signature the realm's key did not make");

    JsonNode other = Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    HttpResponse<String> wrongAudience = call(other.get("access_token").asText());
    assertEquals(401, wrongAudience.statusCode(), "a token for another application: " + wrongAudience.body());
  }

  private HttpResponse<String> call(String bearer) throws Exception {
    return Tokens.HTTP.send(
        HttpRequest.newBuilder(URI.create(stack.agentBaseUrl() + "/"))
            .header("Authorization", "Bearer " + bearer)
            .GET()
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  /** The code flow with PKCE as the legacy dashboard, now a confidential client, performs it. */
  private String signInAsTheLegacyDashboard() throws Exception {
    HttpClient browser = Browser.newBrowser();
    String verifier = Browser.randomUrlSafe(48);
    Map<String, String> query = new LinkedHashMap<>();
    query.put("client_id", "legacy-dashboard");
    query.put("response_type", "code");
    query.put("scope", "openid");
    query.put("redirect_uri", REDIRECT);
    query.put("state", Browser.randomUrlSafe(8));
    query.put("code_challenge", Browser.challenge(verifier));
    query.put("code_challenge_method", "S256");
    HttpResponse<String> page =
        Browser.get(browser, stack.realmUrl() + "/protocol/openid-connect/auth?" + Browser.form(query));
    assertEquals(200, page.statusCode(), page.body());

    Map<String, String> credentials = new LinkedHashMap<>();
    credentials.put("username", KloakwareStack.DEV_USER);
    credentials.put("password", stack.devUserPassword);
    credentials.put("credentialId", "");
    HttpResponse<String> back =
        Browser.followWithinRealm(
            browser, Browser.postForm(browser, Browser.formAction(page.body(), stack.realmUrl()), credentials), stack.realmUrl());
    assertEquals(302, back.statusCode(), back.body());
    String code = Browser.query(URI.create(back.headers().firstValue("Location").orElseThrow())).get("code");

    Map<String, String> exchange = new LinkedHashMap<>();
    exchange.put("grant_type", "authorization_code");
    exchange.put("code", code);
    exchange.put("redirect_uri", REDIRECT);
    exchange.put("client_id", "legacy-dashboard");
    exchange.put("client_secret", stack.legacyClientSecret);
    exchange.put("code_verifier", verifier);
    HttpResponse<String> tokens =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", exchange, null);
    assertEquals(200, tokens.statusCode(), tokens.body());
    return Tokens.JSON.readTree(tokens.body()).get("access_token").asText();
  }
}
