package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;

/**
 * The compromised-token runbook (K11), each step proven: the refresh token
 * revoked at the revocation endpoint is dead at once; the access token,
 * signed and within its five minutes, is reported inactive by introspection
 * the moment the session is gone, which is why the API introspects before a
 * high-value operation instead of trusting the signature alone; the realm's
 * logout-all moves the not-before so nothing issued earlier is honoured; and
 * the session's end reaches Steward as a backchannel logout naming the
 * session.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RevocationTest {

  private KloakwareStack stack;
  private String admin;

  @BeforeAll
  void useTheSharedStack() throws Exception {
    stack = SharedStack.get();
    admin = Admin.token(stack);
  }

  @Test
  @Order(1)
  void aRevokedRefreshTokenIsDeadAtOnce() throws Exception {
    JsonNode tokens =
        Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    String refreshToken = tokens.get("refresh_token").asText();

    Map<String, String> revoke = new LinkedHashMap<>();
    revoke.put("token", refreshToken);
    revoke.put("token_type_hint", "refresh_token");
    revoke.put("client_id", "kloakware-smoke");
    HttpResponse<String> revoked =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/revoke", revoke, null);
    assertEquals(200, revoked.statusCode(), revoked.body());

    Map<String, String> refresh = new LinkedHashMap<>();
    refresh.put("grant_type", "refresh_token");
    refresh.put("client_id", "kloakware-smoke");
    refresh.put("refresh_token", refreshToken);
    HttpResponse<String> refused =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", refresh, null);
    assertEquals(400, refused.statusCode(), refused.body());
    assertTrue(refused.body().contains("invalid_grant"), refused.body());
  }

  @Test
  @Order(2)
  void introspectionClosesTheFiveMinuteWindowWhenTheSessionIsEnded() throws Exception {
    JsonNode tokens =
        Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    String accessToken = tokens.get("access_token").asText();
    JsonNode claims = Tokens.claims(accessToken);
    assertEquals(300, claims.get("exp").asLong() - claims.get("iat").asLong(), "five minutes of signature");

    assertTrue(introspect(accessToken).get("active").asBoolean(), "active while the session lives");

    JsonNode user = Admin.user(stack, admin, KloakwareStack.DEV_USER);
    HttpResponse<String> logout =
        Admin.send(stack, admin, "POST", "/users/" + user.get("id").asText() + "/logout", null);
    assertEquals(204, logout.statusCode(), logout.body());

    JsonNode after = introspect(accessToken);
    assertFalse(after.get("active").asBoolean(), "inactive the moment the session is gone: " + after);
    assertTrue(
        Tokens.claims(accessToken).get("exp").asLong() > System.currentTimeMillis() / 1000,
        "while the signature would still verify");
  }

  /** Last, since it moves the realm's not-before for everything issued before it. */
  @Test
  @Order(4)
  void logoutAllMovesTheRealmsNotBeforeAndNewSignInsStillWork() throws Exception {
    JsonNode before =
        Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    // Answers 200 with the adapters it pushed to; nothing here has an admin URL.
    HttpResponse<String> all = Admin.send(stack, admin, "POST", "/logout-all", null);
    assertTrue(all.statusCode() == 200 || all.statusCode() == 204, all.statusCode() + " " + all.body());

    JsonNode realm = Admin.get(stack, admin, "");
    assertTrue(realm.get("notBefore").asLong() > 0, "the not-before is set: " + realm.get("notBefore"));
    assertFalse(introspect(before.get("access_token").asText()).get("active").asBoolean());

    // The not-before is a second: a token issued within the same second as
    // the push is before it too, which a runbook had better know.
    Thread.sleep(1_100);
    JsonNode fresh =
        Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);
    assertTrue(introspect(fresh.get("access_token").asText()).get("active").asBoolean(), "issued after it");
  }

  @Test
  @Order(3)
  void endingTheSessionReachesStewardAsABackchannelLogout() throws Exception {
    JsonNode client = Admin.get(stack, admin, "/clients?clientId=steward").get(0);
    String id = client.get("id").asText();
    String original = client.path("attributes").path("backchannel.logout.url").asText();
    String receiver =
        "http://host.testcontainers.internal:"
            + stack.auditReceiver().port()
            + "/api/auth/oidc/backchannel-logout";
    try {
      setBackchannelUrl(id, receiver);

      HttpClient browser = Browser.newBrowser();
      String verifier = Browser.randomUrlSafe(48);
      String redirect = KloakwareStack.STEWARD_URL + "/api/auth/oidc/callback";
      Map<String, String> query = new LinkedHashMap<>();
      query.put("client_id", "steward");
      query.put("response_type", "code");
      query.put("scope", "openid");
      query.put("redirect_uri", redirect);
      query.put("state", Browser.randomUrlSafe(8));
      query.put("nonce", Browser.randomUrlSafe(8));
      query.put("code_challenge", Browser.challenge(verifier));
      query.put("code_challenge_method", "S256");
      HttpResponse<String> page =
          Browser.get(browser, stack.realmUrl() + "/protocol/openid-connect/auth?" + Browser.form(query));
      assertEquals(200, page.statusCode(), page.body());
      Map<String, String> credentials = new LinkedHashMap<>();
      credentials.put("username", KloakwareStack.DEV_USER);
      credentials.put("password", stack.devUserPassword);
      credentials.put("credentialId", "");
      HttpResponse<String> back = Browser.postForm(browser, Browser.formAction(page.body()), credentials);
      assertEquals(302, back.statusCode(), back.body());
      String code = Browser.query(URI.create(back.headers().firstValue("Location").orElseThrow())).get("code");

      Map<String, String> exchange = new LinkedHashMap<>();
      exchange.put("grant_type", "authorization_code");
      exchange.put("code", code);
      exchange.put("redirect_uri", redirect);
      exchange.put("client_id", "steward");
      exchange.put("client_secret", stack.clientSecret);
      exchange.put("code_verifier", verifier);
      HttpResponse<String> tokens =
          Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", exchange, null);
      assertEquals(200, tokens.statusCode(), tokens.body());
      String sid = Tokens.claims(Tokens.JSON.readTree(tokens.body()).get("id_token").asText()).get("sid").asText();

      JsonNode user = Admin.user(stack, admin, KloakwareStack.DEV_USER);
      assertEquals(
          204, Admin.send(stack, admin, "POST", "/users/" + user.get("id").asText() + "/logout", null).statusCode());

      String logoutToken = stack.auditReceiver().awaitLogoutToken(sid, 15_000);
      assertNotNull(logoutToken, "Steward's endpoint received the logout token for session " + sid);
      JsonNode claims = Tokens.claims(logoutToken);
      assertEquals("steward", claims.get("aud").asText());
      assertTrue(claims.path("events").has("http://schemas.openid.net/event/backchannel-logout"), claims.toString());
    } finally {
      setBackchannelUrl(id, original);
    }
  }

  private void setBackchannelUrl(String clientId, String url) throws Exception {
    JsonNode client = Admin.get(stack, admin, "/clients/" + clientId);
    ((com.fasterxml.jackson.databind.node.ObjectNode) client.get("attributes")).put("backchannel.logout.url", url);
    HttpResponse<String> updated = Admin.send(stack, admin, "PUT", "/clients/" + clientId, client.toString());
    assertEquals(204, updated.statusCode(), updated.body());
  }

  /** Introspection as the API does it: steward-api, the confidential resource server, asks. */
  private JsonNode introspect(String token) throws Exception {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("token", token);
    form.put("client_id", "steward-api");
    form.put("client_secret", stack.stewardApiSecret);
    HttpResponse<String> response =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token/introspect", form, null);
    assertEquals(200, response.statusCode(), response.body());
    return Tokens.JSON.readTree(response.body());
  }
}
