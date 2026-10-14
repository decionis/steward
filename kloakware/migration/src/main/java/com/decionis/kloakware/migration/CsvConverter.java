package com.decionis.kloakware.migration;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The in-house SQL or Oracle users table, as one SELECT exports it to CSV:
 * a header row naming {@code username, email, first_name, last_name, market,
 * roles, algorithm, salt, hash}, roles as a semicolon list, the salt and the
 * hash base64 as the application stored them, and the algorithm one of the
 * realm's legacy providers. Quoted fields are honoured; nothing else of CSV's
 * dialects is needed for what a database writes.
 */
public final class CsvConverter {

  public record Result(List<LegacyUser> users, List<String> leftOut) {}

  public Result convert(String csv) {
    List<LegacyUser> users = new ArrayList<>();
    List<String> leftOut = new ArrayList<>();
    List<String> header = null;
    for (String line : csv.split("\n")) {
      if (line.isBlank() || line.startsWith("#")) continue;
      List<String> fields = fields(line);
      if (header == null) {
        header = fields.stream().map(f -> f.trim().toLowerCase()).collect(Collectors.toList());
        continue;
      }
      Map<String, String> row = new java.util.HashMap<>();
      for (int i = 0; i < header.size() && i < fields.size(); i++) row.put(header.get(i), fields.get(i));
      String username = row.getOrDefault("username", "").trim();
      if (username.isEmpty()) continue;
      String algorithm = row.getOrDefault("algorithm", "").trim();
      String hash = row.getOrDefault("hash", "").trim();
      String salt = row.getOrDefault("salt", "").trim();
      if (algorithm.isEmpty() || hash.isEmpty() || salt.isEmpty()) {
        leftOut.add(username + ": no usable password");
        continue;
      }
      List<String> roles =
          Arrays.stream(row.getOrDefault("roles", "").split(";"))
              .map(String::trim)
              .filter(r -> !r.isEmpty())
              .map(LegacyUser::realmRole)
              .collect(Collectors.toList());
      users.add(
          new LegacyUser(
              username,
              blankToNull(row.get("email")),
              blankToNull(row.get("first_name")),
              blankToNull(row.get("last_name")),
              blankToNull(row.get("market")),
              roles,
              new LegacyPassword(algorithm, hash, salt)));
    }
    return new Result(users, leftOut);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  static List<String> fields(String line) {
    List<String> fields = new ArrayList<>();
    StringBuilder current = new StringBuilder();
    boolean quoted = false;
    for (int i = 0; i < line.length(); i++) {
      char c = line.charAt(i);
      if (quoted) {
        if (c == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
          current.append('"');
          i++;
        } else if (c == '"') {
          quoted = false;
        } else {
          current.append(c);
        }
      } else if (c == '"') {
        quoted = true;
      } else if (c == ',') {
        fields.add(current.toString());
        current.setLength(0);
      } else {
        current.append(c);
      }
    }
    fields.add(current.toString().replace("\r", ""));
    return fields;
  }
}
