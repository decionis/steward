package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The ldap federation against the OpenLDAP the compose file builds: people
 * sign in with the directory's password and arrive with their market from an
 * attribute and a group, their Steward role from a group, read-only; a full
 * sync reports what it did; and when the directory is down, its people
 * cannot sign in while everyone else can.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LdapFederationTest {

  private static final String CLIENT = "kloakware-smoke";

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void aPersonFromTheDirectorySignsInWithTheirMarketAndRole() throws Exception {
    JsonNode anna = Tokens.claims(Tokens.passwordGrant(stack, CLIENT, "anna.directory", stack.devUserPassword).get("id_token").asText());
    assertEquals("anna@directory.test", anna.get("email").asText());
    assertTrue(has(anna.path("steward").path("markets"), "SE"), anna.toString());
    assertTrue(has(anna.path("steward").path("roles"), "operator"), anna.toString());

    JsonNode bo = Tokens.claims(Tokens.passwordGrant(stack, CLIENT, "bo.directory", stack.devUserPassword).get("id_token").asText());
    assertTrue(has(bo.path("steward").path("markets"), "DE"), bo.toString());
    assertFalse(has(bo.path("steward").path("roles"), "operator"), "no role group in the directory: " + bo);

    String admin = Admin.token(stack);
    JsonNode user = Admin.user(stack, admin, "anna.directory");
    assertTrue(user.hasNonNull("federationLink"), "imported from the directory: " + user);
    assertEquals("SE", user.path("attributes").path("market").path(0).asText());
  }

  @Test
  void theDirectoryIsReadOnlyFromHere() throws Exception {
    String admin = Admin.token(stack);
    Tokens.passwordGrant(stack, CLIENT, "anna.directory", stack.devUserPassword);
    String id = Admin.user(stack, admin, "anna.directory").get("id").asText();
    HttpResponse<String> reset =
        Admin.send(stack, admin, "PUT", "/users/" + id + "/reset-password",
            "{\"type\":\"password\",\"value\":\"Changed-Here-2026!\",\"temporary\":false}");
    assertEquals(400, reset.statusCode(), reset.body());
  }

  @Test
  void aFullSyncReportsWhatItDid() throws Exception {
    String admin = Admin.token(stack);
    JsonNode components = Admin.get(stack, admin, "/components?type=org.keycloak.storage.UserStorageProvider&name=ldap");
    assertEquals(1, components.size(), components.toString());
    String componentId = components.get(0).get("id").asText();
    HttpResponse<String> sync =
        Admin.send(stack, admin, "POST", "/user-storage/" + componentId + "/sync?action=triggerFullSync", null);
    assertEquals(200, sync.statusCode(), sync.body());
    JsonNode result = Tokens.JSON.readTree(sync.body());
    assertEquals(0, result.get("failed").asInt(), result.toString());
    assertEquals(2, result.get("added").asInt() + result.get("updated").asInt(), "both people: " + result);
  }

  @Test
  void whenTheDirectoryIsDownItsPeopleCannotSignInAndOthersStillCan() throws Exception {
    Tokens.passwordGrant(stack, CLIENT, "anna.directory", stack.devUserPassword);
    stack.directory(false);
    try {
      HttpResponse<String> down = grant("anna.directory", stack.devUserPassword);
      assertNotEquals(200, down.statusCode(), "the directory's password cannot be checked: " + down.body());
      JsonNode local = Tokens.passwordGrant(stack, CLIENT, KloakwareStack.DEV_USER, stack.devUserPassword);
      assertTrue(local.hasNonNull("access_token"), "a realm user is unaffected");
    } finally {
      stack.directory(true);
    }
    HttpResponse<String> back = null;
    for (int attempt = 0; attempt < 10; attempt++) {
      back = grant("anna.directory", stack.devUserPassword);
      if (back.statusCode() == 200) break;
      Thread.sleep(1000);
    }
    assertEquals(200, back.statusCode(), "the directory is back: " + back.body());
  }

  private HttpResponse<String> grant(String username, String password) throws Exception {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "password");
    form.put("client_id", CLIENT);
    form.put("username", username);
    form.put("password", password);
    form.put("scope", "openid");
    return Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", form, null);
  }

  private static boolean has(JsonNode array, String value) {
    for (JsonNode item : array) if (value.equals(item.asText())) return true;
    return false;
  }
}
