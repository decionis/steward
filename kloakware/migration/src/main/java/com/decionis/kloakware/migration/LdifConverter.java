package com.decionis.kloakware.migration;

import com.decionis.kloakware.hash.LegacySsha;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The SiteMinder user directory, as {@code ldapsearch -LLL} exports it: one
 * entry per person with {@code uid}, {@code mail}, {@code givenName},
 * {@code sn}, the country as the market, group memberships as roles, and
 * {@code userPassword} in the directory's salted SHA family. SiteMinder keeps
 * no password of its own; the directory behind it does, which is what makes
 * the migration possible without a reset. Entries without a usable password
 * are reported and left out: those users get a reset at the deadline.
 */
public final class LdifConverter {

  /** What the export looked like and what was left out, for the operator's log. */
  public record Result(List<LegacyUser> users, List<String> leftOut) {}

  private final String marketAttribute;

  public LdifConverter() {
    this("c");
  }

  public LdifConverter(String marketAttribute) {
    this.marketAttribute = marketAttribute;
  }

  public Result convert(String ldif) {
    List<LegacyUser> users = new ArrayList<>();
    List<String> leftOut = new ArrayList<>();
    for (Map<String, List<String>> entry : entries(ldif)) {
      String uid = first(entry, "uid");
      if (uid == null) continue;
      List<String> roles = new ArrayList<>();
      for (String member : entry.getOrDefault("memberof", List.of())) {
        String cn = rdnValue(member, "cn");
        if (cn != null) roles.add(LegacyUser.realmRole(cn));
      }
      String password = first(entry, "userpassword");
      LegacyPassword legacy;
      try {
        LegacySsha.Parts parts = LegacySsha.parse(password);
        legacy =
            new LegacyPassword(
                LegacySsha.ALGORITHM,
                Base64.getEncoder().encodeToString(parts.digest()),
                Base64.getEncoder().encodeToString(parts.salt()));
      } catch (IllegalArgumentException unusable) {
        leftOut.add(uid + ": " + unusable.getMessage());
        continue;
      }
      users.add(
          new LegacyUser(
              uid,
              first(entry, "mail"),
              first(entry, "givenname"),
              first(entry, "sn"),
              first(entry, marketAttribute.toLowerCase()),
              roles,
              legacy));
    }
    return new Result(users, leftOut);
  }

  /** LDIF's shape: entries separated by blank lines, continuation lines start with a space, `::` means base64. */
  static List<Map<String, List<String>>> entries(String ldif) {
    List<Map<String, List<String>>> entries = new ArrayList<>();
    List<String> logical = new ArrayList<>();
    for (String raw : ldif.split("\n")) {
      if (raw.startsWith("#")) continue;
      if (raw.startsWith(" ") && !logical.isEmpty()) {
        logical.set(logical.size() - 1, logical.get(logical.size() - 1) + raw.substring(1));
      } else {
        logical.add(raw);
      }
    }
    Map<String, List<String>> current = new LinkedHashMap<>();
    for (String line : logical) {
      if (line.isBlank()) {
        if (!current.isEmpty()) entries.add(current);
        current = new LinkedHashMap<>();
        continue;
      }
      int colon = line.indexOf(':');
      if (colon < 0) continue;
      String name = line.substring(0, colon).trim().toLowerCase();
      String value;
      if (line.startsWith("::", colon)) {
        value =
            new String(
                Base64.getDecoder().decode(line.substring(colon + 2).trim()), StandardCharsets.UTF_8);
      } else {
        value = line.substring(colon + 1).trim();
      }
      current.computeIfAbsent(name, k -> new ArrayList<>()).add(value);
    }
    if (!current.isEmpty()) entries.add(current);
    return entries;
  }

  private static String first(Map<String, List<String>> entry, String name) {
    List<String> values = entry.get(name);
    return values == null || values.isEmpty() ? null : values.get(0);
  }

  /** The value of the first RDN with this type in a DN: `cn=operators,ou=groups,...` gives `operators`. */
  static String rdnValue(String dn, String type) {
    for (String rdn : dn.split(",")) {
      String trimmed = rdn.trim();
      if (trimmed.toLowerCase().startsWith(type.toLowerCase() + "=")) return trimmed.substring(type.length() + 1);
    }
    return null;
  }
}
