package com.decionis.kloakware.users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class StewardUserTest {

  @Test
  void splitsTheDisplayNameForKeycloak() {
    StewardUser user = new StewardUser("id", "a@b.test", "Ada Byron Lovelace", null, List.of(), "ACTIVE");
    assertEquals("Ada", user.firstName());
    assertEquals("Byron Lovelace", user.lastName());
    StewardUser mononym = new StewardUser("id", "a@b.test", "Ada", null, List.of(), "ACTIVE");
    assertEquals("Ada", mononym.firstName());
    assertEquals("", mononym.lastName());
  }

  @Test
  void readsRolesFromStewardsCommaSeparatedColumn() {
    assertEquals(List.of("ADMIN", "APPROVER"), StewardUsers.roles("ADMIN,APPROVER"));
    assertEquals(List.of("OPERATOR"), StewardUsers.roles(" OPERATOR , "));
    assertEquals(List.of(), StewardUsers.roles(null));
    assertEquals(List.of(), StewardUsers.roles(""));
  }

  @Test
  void onlyAnActiveUserWithAHashMayUseAPassword() {
    assertTrue(new StewardUser("id", "a@b.test", "A", "$argon2id$...", List.of(), "ACTIVE").active());
    assertFalse(new StewardUser("id", "a@b.test", "A", "$argon2id$...", List.of(), "SUSPENDED").active());
    assertFalse(new StewardUser("id", "a@b.test", "A", null, List.of(), "ACTIVE").hasPassword());
    assertFalse(new StewardUser("id", "a@b.test", "A", " ", List.of(), "ACTIVE").hasPassword());
  }
}
