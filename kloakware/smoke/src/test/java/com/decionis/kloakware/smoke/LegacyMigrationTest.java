package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.decionis.kloakware.migration.AdminApi;
import com.decionis.kloakware.migration.CsvConverter;
import com.decionis.kloakware.migration.LdifConverter;
import com.decionis.kloakware.migration.Migration;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;

/**
 * The migration runbook (K13) run against the stack with the fixtures: the
 * SiteMinder directory's export and the in-house SQL table's, converted,
 * imported in one movement with what the realm already has skipped and what
 * the export repeats reported; a migrated user signing in with the password
 * the legacy system knew and holding the role and market the export gave
 * them, the legacy hash replaced by argon2 in that same sign-in; the status
 * counting who has moved; a second import changing nothing; and the deadline
 * revoking what is left with a reset required.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LegacyMigrationTest {

  private static final String SITEMINDER_PASSWORD = "Siteminder-Sign-In-2026!";
  private static final String SQL_PASSWORD = "Oracle-Sign-In-2026!";

  private KloakwareStack stack;
  private Migration migration;
  private AdminApi api;
  private String admin;

  @BeforeAll
  void useTheSharedStack() throws Exception {
    stack = SharedStack.get();
    api = AdminApi.asAdministrator(stack.baseUrl(), "steward", "admin", stack.adminPassword);
    migration = new Migration(api, 2);
    admin = Admin.token(stack);
  }

  @Test
  @Order(1)
  void theSiteMinderDirectoryIsImportedWithWhatTheRealmHasSkippedAndRepeatsReported() throws Exception {
    LdifConverter.Result converted =
        new LdifConverter()
            .convert(
                Files.readString(
                    stack.root().resolve("migration/fixtures/siteminder/users.ldif"), StandardCharsets.UTF_8));
    assertEquals(5, converted.users().size());

    Migration.ImportResult result = migration.importUsers(converted.users(), "siteminder");
    assertEquals(3, result.added(), result.notes().toString());
    assertEquals(1, result.skippedExisting(), "erin.example is already in the realm: " + result.notes());
    assertEquals(1, result.duplicatesInExport(), "dup.legacy repeats maria's email: " + result.notes());
    assertEquals(0, result.failed(), result.notes().toString());

    JsonNode maria = Admin.user(stack, admin, "maria.legacy");
    assertEquals("siteminder", maria.path("attributes").path("legacySource").get(0).asText());
    assertEquals("legacy-ssha", passwordAlgorithm(maria.get("id").asText()), "the directory's hash, as imported");
  }

  @Test
  @Order(2)
  void theSqlTableIsImportedToo() throws Exception {
    CsvConverter.Result converted =
        new CsvConverter()
            .convert(
                Files.readString(
                    stack.root().resolve("migration/fixtures/in-house-sql/users.csv"), StandardCharsets.UTF_8));
    Migration.ImportResult result = migration.importUsers(converted.users(), "in-house-sql");
    assertEquals(2, result.added(), result.notes().toString());
    assertEquals(0, result.failed(), result.notes().toString());
  }

  @Test
  @Order(3)
  void aMigratedUserSignsInWithTheLegacyPasswordAndIsRehashedInThatSignIn() throws Exception {
    JsonNode tokens = Tokens.passwordGrant(stack, "kloakware-smoke", "maria.legacy", SITEMINDER_PASSWORD);
    JsonNode access = Tokens.claims(tokens.get("access_token").asText());
    assertTrue(access.path("steward").path("roles").toString().contains("\"operator\""), access.toString());
    assertTrue(access.path("steward").path("markets").toString().contains("\"SE\""), access.toString());
    assertEquals("argon2", passwordAlgorithm(Admin.user(stack, admin, "maria.legacy").get("id").asText()));

    JsonNode sql = Tokens.passwordGrant(stack, "kloakware-smoke", "pavel.legacy", SQL_PASSWORD);
    JsonNode pavel = Tokens.claims(sql.get("access_token").asText());
    assertTrue(pavel.path("steward").path("markets").toString().contains("\"NG\""), pavel.toString());
    assertEquals("argon2", passwordAlgorithm(Admin.user(stack, admin, "pavel.legacy").get("id").asText()));

    // The wrong password is still the wrong password.
    Map<String, String> wrong = new LinkedHashMap<>();
    wrong.put("grant_type", "password");
    wrong.put("client_id", "kloakware-smoke");
    wrong.put("username", "omar.legacy");
    wrong.put("password", "Siteminder-Sign-In-2026?");
    HttpResponse<String> refused =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", wrong, null);
    // Keycloak 26 answers 400 invalid_grant to a refused password grant (the K5 lesson).
    assertEquals(400, refused.statusCode(), refused.body());
    assertTrue(refused.body().contains("invalid_grant"), refused.body());
  }

  @Test
  @Order(4)
  void theStatusCountsWhoHasMoved_andASecondImportChangesNothing() throws Exception {
    Migration.Status status = migration.status("siteminder");
    assertEquals(3, status.total(), status.toString());
    assertEquals(1, status.migrated(), status.toString());
    assertEquals(List.of("nina.legacy", "omar.legacy"), status.pendingUsernames().stream().sorted().toList());

    LdifConverter.Result again =
        new LdifConverter()
            .convert(
                Files.readString(
                    stack.root().resolve("migration/fixtures/siteminder/users.ldif"), StandardCharsets.UTF_8));
    Migration.ImportResult second = migration.importUsers(again.users(), "siteminder");
    assertEquals(0, second.added(), second.notes().toString());
    assertEquals(4, second.skippedExisting(), second.notes().toString());
    assertEquals("argon2", passwordAlgorithm(Admin.user(stack, admin, "maria.legacy").get("id").asText()), "untouched");
  }

  @Test
  @Order(5)
  void pastTheDeadlineTheLegacyHashesAreRevokedAndAResetRequired() throws Exception {
    Migration.RevokeResult revoked = migration.revoke("siteminder", false);
    assertEquals(List.of("nina.legacy", "omar.legacy"), revoked.usernames().stream().sorted().toList());

    JsonNode omar = Admin.user(stack, admin, "omar.legacy");
    assertEquals(null, passwordAlgorithm(omar.get("id").asText()), "no password left");
    assertTrue(omar.path("requiredActions").toString().contains("UPDATE_PASSWORD"), omar.toString());

    Map<String, String> grant = new LinkedHashMap<>();
    grant.put("grant_type", "password");
    grant.put("client_id", "kloakware-smoke");
    grant.put("username", "omar.legacy");
    grant.put("password", SITEMINDER_PASSWORD);
    HttpResponse<String> refused =
        Tokens.postForm(stack.realmUrl() + "/protocol/openid-connect/token", grant, null);
    assertFalse(refused.statusCode() == 200, "the legacy password no longer signs in: " + refused.body());

    Migration.Status after = migration.status("siteminder");
    assertEquals(1, after.migrated(), after.toString());
    assertEquals(0, after.pending(), "nobody is on a legacy hash any more: " + after);
    assertEquals(2, after.awaitingReset(), after.toString());
  }

  /** The user's password credential's algorithm, or null when there is none. */
  private String passwordAlgorithm(String userId) throws Exception {
    for (JsonNode credential : Admin.get(stack, admin, "/users/" + userId + "/credentials")) {
      if ("password".equals(credential.path("type").asText())) {
        return Tokens.JSON.readTree(credential.path("credentialData").asText()).path("algorithm").asText();
      }
    }
    return null;
  }
}
