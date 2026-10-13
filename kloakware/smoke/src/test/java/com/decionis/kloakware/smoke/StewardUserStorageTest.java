package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.decionis.kloakware.users.Argon2Phc;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The Steward user storage compiled into the server, over the stand-in
 * Steward database: a local Steward account signs in through kloakware with
 * its own password, is imported with Steward's id and roles, cannot change
 * its password here, and follows Steward when suspended or deleted.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StewardUserStorageTest {

  private static final String CLIENT = "kloakware-smoke";
  private static final String TOKEN_PATH = "/protocol/openid-connect/token";

  private KloakwareStack stack;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
  }

  @Test
  void aStewardLocalAccountSignsInWithItsOwnPasswordAndRoles() throws Exception {
    String password = "St!1-" + UUID.randomUUID();
    String id = seed("mona", password, "ADMIN,OPERATOR", "ACTIVE");
    String email = "mona-" + id.substring(0, 8) + "@example.test";

    JsonNode tokens = Tokens.passwordGrant(stack, CLIENT, email, password);
    JsonNode access = Tokens.claims(tokens.get("id_token").asText());
    assertEquals(id, access.path("sub").asText(), "the kloakware user is Steward's, by id: " + access);
    assertEquals(email, access.get("email").asText());
    assertTrue(has(access.path("steward").path("roles"), "admin"), access.toString());
    assertTrue(has(access.path("steward").path("roles"), "operator"), access.toString());

    String admin = Admin.token(stack);
    JsonNode user = Admin.get(stack, admin, "/users/" + id);
    assertTrue(user.hasNonNull("federationLink"), "imported from the storage: " + user);
    assertEquals("Mona", user.get("firstName").asText());
    assertEquals("Example", user.get("lastName").asText());
    assertEquals(id, user.path("attributes").path("stewardId").path(0).asText());
  }

  @Test
  void aWrongPasswordAndAnAccountWithoutOneAreRefused() throws Exception {
    String password = "St!1-" + UUID.randomUUID();
    String id = seed("nils", password, "VIEWER", "ACTIVE");
    String email = "nils-" + id.substring(0, 8) + "@example.test";
    assertNotEquals(200, grant(email, password + "x").statusCode(), "a wrong password");

    String ssoOnly = seed("olga", null, "VIEWER", "ACTIVE");
    String ssoEmail = "olga-" + ssoOnly.substring(0, 8) + "@example.test";
    assertNotEquals(200, grant(ssoEmail, password).statusCode(), "no hash in Steward: no password here");
  }

  @Test
  void thePasswordCannotBeChangedHere() throws Exception {
    String password = "St!1-" + UUID.randomUUID();
    String id = seed("pia", password, "OPERATOR", "ACTIVE");
    Tokens.passwordGrant(stack, CLIENT, "pia-" + id.substring(0, 8) + "@example.test", password);

    HttpResponse<String> reset =
        Admin.send(
            stack,
            Admin.token(stack),
            "PUT",
            "/users/" + id + "/reset-password",
            "{\"type\":\"password\",\"value\":\"Changed-Here-2026!\",\"temporary\":false}");
    assertEquals(400, reset.statusCode(), reset.body());
    assertTrue(reset.body().contains("read only"), "Keycloak's own wording for a refused update: " + reset.body());
  }

  @Test
  void theAccountFollowsStewardWhenSuspendedAndWhenDeleted() throws Exception {
    String password = "St!1-" + UUID.randomUUID();
    String id = seed("rune", password, "APPROVER", "ACTIVE");
    String email = "rune-" + id.substring(0, 8) + "@example.test";
    Tokens.passwordGrant(stack, CLIENT, email, password);

    update("UPDATE users SET status = 'SUSPENDED' WHERE id = ?", id);
    assertNotEquals(200, grant(email, password).statusCode(), "suspended in Steward: refused at once");
    // The copy is validated when it is loaded from the database; the user
    // cache serves it for up to five minutes in between. Cleared here, as
    // time would.
    String admin = Admin.token(stack);
    clearUserCache(admin);
    assertFalse(Admin.get(stack, admin, "/users/" + id).get("enabled").asBoolean(), "the copy is disabled");

    update("DELETE FROM users WHERE id = ?", id);
    clearUserCache(admin);
    HttpResponse<String> gone = Admin.send(stack, admin, "GET", "/users/" + id, null);
    assertEquals(404, gone.statusCode(), "the copy is removed with the row: " + gone.body());
  }

  private void clearUserCache(String admin) throws Exception {
    assertEquals(204, Admin.send(stack, admin, "POST", "/clear-user-cache", null).statusCode());
  }

  private HttpResponse<String> grant(String username, String password) throws Exception {
    Map<String, String> form = new LinkedHashMap<>();
    form.put("grant_type", "password");
    form.put("client_id", CLIENT);
    form.put("username", username);
    form.put("password", password);
    form.put("scope", "openid");
    return Tokens.postForm(stack.realmUrl() + TOKEN_PATH, form, null);
  }

  /** A Steward user in the stand-in database, with an argon2id hash of the run's own password. */
  private String seed(String name, String password, String roles, String status) throws Exception {
    String id = UUID.randomUUID().toString();
    byte[] salt = new byte[16];
    new SecureRandom().nextBytes(salt);
    String hash = password == null ? null : Argon2Phc.hash(password, salt);
    String now = "2026-10-13T00:00:00.000Z";
    try (Connection connection = connect();
        PreparedStatement insert =
            connection.prepareStatement(
                "INSERT INTO users (id, email, display_name, password_hash, roles, status, created_at, updated_at)"
                    + " VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {
      insert.setString(1, id);
      insert.setString(2, name + "-" + id.substring(0, 8) + "@example.test");
      insert.setString(3, Character.toUpperCase(name.charAt(0)) + name.substring(1) + " Example");
      insert.setString(4, hash);
      insert.setString(5, roles);
      insert.setString(6, status);
      insert.setString(7, now);
      insert.setString(8, now);
      insert.executeUpdate();
    }
    return id;
  }

  private void update(String sql, String id) throws Exception {
    try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
      statement.setString(1, id);
      statement.executeUpdate();
    }
  }

  private Connection connect() throws Exception {
    return DriverManager.getConnection(stack.stewardJdbcUrl(), "steward", stack.stewardDbPassword);
  }

  private static boolean has(JsonNode array, String value) {
    for (JsonNode item : array) if (value.equals(item.asText())) return true;
    return false;
  }
}
