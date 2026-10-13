package com.decionis.kloakware.users;

import java.util.List;

/**
 * One row of Steward's {@code users} table as the provider reads it. Roles are
 * Steward's own names ({@code ADMIN}, {@code APPROVER}, ...), the hash is null
 * for a user who only ever signed in through single sign-on, and only an
 * {@code ACTIVE} user may sign in.
 */
public record StewardUser(
    String id, String email, String displayName, String passwordHash, List<String> roles, String status) {

  public boolean active() {
    return "ACTIVE".equals(status);
  }

  public boolean hasPassword() {
    return passwordHash != null && !passwordHash.isBlank();
  }

  /** The first word of the display name, for Keycloak's first name. */
  public String firstName() {
    String name = displayName == null ? "" : displayName.strip();
    int space = name.indexOf(' ');
    return space < 0 ? name : name.substring(0, space);
  }

  /** The rest of the display name, for Keycloak's last name; empty when there is none. */
  public String lastName() {
    String name = displayName == null ? "" : displayName.strip();
    int space = name.indexOf(' ');
    return space < 0 ? "" : name.substring(space + 1).strip();
  }
}
