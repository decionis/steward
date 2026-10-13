package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Keycloak Authorization Services on the steward-api resource server: a
 * review in a market needs the approver role and membership of that market;
 * a view needs the market. Asked through the token endpoint's UMA grant with
 * response_mode=decision, which is what an API gateway or a service would do
 * before honouring a request.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AuthorizationServicesTest {

  private KloakwareStack stack;
  private String erin;
  private String ops;

  @BeforeAll
  void signTheUsersIn() throws Exception {
    stack = SharedStack.get();
    // Role policies read the roles the token carries, so the deciding token
    // is the fat one here; docs/Tokens.md says what that means for a lean API.
    erin = Tokens.passwordGrant(stack, "kloakware-fat", "erin.example", stack.devUserPassword).get("access_token").asText();
    ops = Tokens.passwordGrant(stack, "kloakware-fat", "ops.example", stack.devUserPassword).get("access_token").asText();
  }

  @Test
  void anApproverInTheMarketMayReviewThere() throws Exception {
    assertEquals(200, decide(erin, "opportunity:DE#review").statusCode());
  }

  @Test
  void anApproverOutsideTheMarketMayNot() throws Exception {
    assertEquals(403, decide(erin, "opportunity:NG#review").statusCode());
  }

  @Test
  void theTechnicalTeamInTheMarketMayViewButNotReview() throws Exception {
    assertEquals(200, decide(ops, "opportunity:DE#view").statusCode());
    assertEquals(403, decide(ops, "opportunity:DE#review").statusCode());
  }

  private HttpResponse<String> decide(String bearer, String permission) throws Exception {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "urn:ietf:params:oauth:grant-type:uma-ticket");
    form.put("audience", "steward-api");
    form.put("permission", permission);
    form.put("response_mode", "decision");
    return Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", form, bearer);
  }
}
