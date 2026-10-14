package com.decionis.kloakware.migration;

import java.util.List;

/**
 * One user as the legacy system exported them, normalised: the record every
 * converter produces and the import reads. Roles are Steward's realm roles
 * with their prefix; the market is the group under /markets/; the password is
 * the legacy hash with the algorithm one of the realm's legacy providers
 * verifies.
 */
public record LegacyUser(
    String username,
    String email,
    String firstName,
    String lastName,
    String market,
    List<String> roles,
    LegacyPassword password) {

  /** A role as the export named it, as the realm names it: `operator` and `steward-operator` are the same role. */
  public static String realmRole(String name) {
    String trimmed = name.trim();
    return trimmed.startsWith("steward-") ? trimmed : "steward-" + trimmed;
  }
}
