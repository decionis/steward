package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The fat token and the lean one, measured on the same user in the same
 * realm: the dev-only kloakware-fat client with full scope, every built-in
 * scope and no lightweight access token, against kloakware-smoke, shaped like
 * the steward client. The numbers go into docs/Tokens.md; the assertions keep
 * them honest.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TokenShapeTest {

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void theLeanAccessTokenIsSmallerAndCarriesOnlyWhatStewardReads() throws Exception {
    JsonNode fat = Tokens.passwordGrant(stack, "kloakware-fat", KloakwareStack.DEV_USER, stack.devUserPassword);
    JsonNode lean = Tokens.passwordGrant(stack, "kloakware-smoke", KloakwareStack.DEV_USER, stack.devUserPassword);

    String fatAccess = fat.get("access_token").asText();
    String leanAccess = lean.get("access_token").asText();
    JsonNode fatClaims = Tokens.claims(fatAccess);
    JsonNode leanClaims = Tokens.claims(leanAccess);

    System.out.printf(
        "%ntoken shape | fat: %d bytes, %d claims | lean: %d bytes, %d claims%n",
        fatAccess.length(), fatClaims.size(), leanAccess.length(), leanClaims.size());
    System.out.println("fat claims:  " + names(fatClaims));
    System.out.println("lean claims: " + names(leanClaims));
    System.out.println("fat realm_access.roles: " + fatClaims.path("realm_access").path("roles"));
    System.out.println("lean steward: " + leanClaims.get("steward"));

    assertTrue(leanAccess.length() < fatAccess.length() * 0.75, "the lean token is at least a quarter smaller");
    assertTrue(leanClaims.has("steward"), "the compact claim is in the lightweight token");
    assertTrue(leanClaims.has("sub") && leanClaims.has("sid"), "subject and session stay");
    for (String absent : List.of("realm_access", "resource_access", "name", "email", "preferred_username", "market")) {
      assertFalse(leanClaims.has(absent), absent + " is not in the lean access token");
    }
    assertTrue(fatClaims.has("realm_access") && fatClaims.has("name"), "the fat token carries everything");

    // The ID token keeps the profile: it is what the application reads about the person.
    JsonNode leanId = Tokens.claims(lean.get("id_token").asText());
    assertTrue(leanId.has("name") && leanId.has("email") && leanId.has("steward"));
  }

  private static List<String> names(JsonNode claims) {
    List<String> names = new ArrayList<>();
    claims.fieldNames().forEachRemaining(names::add);
    return names;
  }
}
