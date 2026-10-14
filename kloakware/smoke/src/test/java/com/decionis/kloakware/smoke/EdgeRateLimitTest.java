package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The rate limits at the edge (K11): HAProxy counts requests per source and
 * answers 429 past the compose file's limits for the token endpoint and for
 * the login form's post, so a flood never reaches a node and never costs a
 * password hash. The window is ten seconds; the test waits it out so the
 * classes after it are not counted against this one's flood. HAProxy's rate
 * counters are two periods with the older one weighted down as it ages, so
 * a burst that straddles the boundary is seen as fewer than it was: the
 * flood here is twice the limit, and the first 429 is expected anywhere
 * past a third of the limit and before twice it.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class EdgeRateLimitTest {

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @AfterAll
  void letTheWindowPass() throws InterruptedException {
    Thread.sleep(11_000);
  }

  @Test
  void theTokenEndpointIsLimitedPerSource() throws Exception {
    Map<String, String> wrong = new LinkedHashMap<>();
    wrong.put("grant_type", "client_credentials");
    wrong.put("client_id", "steward-api");
    wrong.put("client_secret", "not-the-secret");
    String url = stack.realmUrl() + "/protocol/openid-connect/token";

    int limit = KloakwareStack.EDGE_TOKEN_RATE;
    int firstRefused = flood(url, wrong, 2 * limit + 10);
    assertTrue(firstRefused >= 0, "a 429 arrives within " + (2 * limit + 10) + " requests");
    assertTrue(
        firstRefused > limit / 3,
        "the limit is the configured one, not a lower accident: first 429 at request " + firstRefused);
    assertTrue(firstRefused <= 2 * limit + 1, "the limit holds near " + limit + ": first 429 at request " + firstRefused);

    Thread.sleep(11_000);
    HttpResponse<String> after = Tokens.postForm(url, wrong, null);
    assertNotEquals(429, after.statusCode(), "the window passed: " + after.body());
    assertEquals(401, after.statusCode(), after.body());
  }

  @Test
  void theLoginPostIsLimitedPerSource() throws Exception {
    Map<String, String> guess = new LinkedHashMap<>();
    guess.put("username", KloakwareStack.DEV_USER);
    guess.put("password", "not-the-password");
    guess.put("credentialId", "");
    String url =
        stack.realmUrl()
            + "/login-actions/authenticate?session_code=none&execution=none&client_id=steward&tab_id=none";

    int limit = KloakwareStack.EDGE_LOGIN_RATE;
    int firstRefused = flood(url, guess, 2 * limit + 10);
    assertTrue(firstRefused >= 0, "a 429 arrives within " + (2 * limit + 10) + " posts");
    assertTrue(firstRefused > limit / 3, "first 429 at post " + firstRefused);
    assertTrue(firstRefused <= 2 * limit + 1, "first 429 at post " + firstRefused);

    // The page itself is not limited: a GET of the login page past the flood still answers.
    HttpResponse<String> page =
        Browser.get(Tokens.HTTP, stack.realmUrl() + "/protocol/openid-connect/auth?client_id=steward&response_type=code");
    assertNotEquals(429, page.statusCode());
  }

  /** Posts the form this many times; the index of the first 429, or -1. */
  private static int flood(String url, Map<String, String> form, int times) throws Exception {
    for (int i = 0; i < times; i++) {
      HttpResponse<String> response = Tokens.postForm(url, form, null);
      if (response.statusCode() == 429) return i;
    }
    return -1;
  }
}
