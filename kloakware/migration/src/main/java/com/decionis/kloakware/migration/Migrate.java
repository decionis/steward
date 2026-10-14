package com.decionis.kloakware.migration;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/**
 * The command. Where kloakware is and as whom come from the environment, as
 * the promotion script's do: KLOAKWARE_URL, KLOAKWARE_REALM (steward), and
 * either KLOAKWARE_CI_CLIENT_SECRET for the kloakware-ci service account or
 * KEYCLOAK_USER and KEYCLOAK_PASSWORD for the administrator.
 *
 * <pre>
 *   convert-ldif  users.ldif users.jsonl [market-attribute]   the SiteMinder directory's export
 *   convert-csv   users.csv  users.jsonl                      the SQL or Oracle table's export
 *   import        users.jsonl source                          into the realm, idempotent
 *   status        source                                      migrated and pending, by source
 *   revoke        source [--notify]                           past the deadline: remove, require a reset
 * </pre>
 */
public final class Migrate {

  private Migrate() {}

  public static void main(String[] args) throws Exception {
    if (args.length == 0) {
      usage();
      System.exit(2);
    }
    switch (args[0]) {
      case "convert-ldif" -> {
        LdifConverter.Result result =
            new LdifConverter(args.length > 3 ? args[3] : "c").convert(Files.readString(Path.of(args[1]), StandardCharsets.UTF_8));
        Export.write(result.users(), Path.of(args[2]));
        report(result.users().size(), result.leftOut(), args[2]);
      }
      case "convert-csv" -> {
        CsvConverter.Result result = new CsvConverter().convert(Files.readString(Path.of(args[1]), StandardCharsets.UTF_8));
        Export.write(result.users(), Path.of(args[2]));
        report(result.users().size(), result.leftOut(), args[2]);
      }
      case "import" -> {
        List<LegacyUser> users = Export.read(Path.of(args[1]));
        Migration.ImportResult result = new Migration(api()).importUsers(users, args[2]);
        result.notes().forEach(System.out::println);
        System.out.printf(
            "imported %d, already in the realm %d, duplicates in the export %d, failed %d%n",
            result.added(), result.skippedExisting(), result.duplicatesInExport(), result.failed());
        if (result.failed() > 0) System.exit(1);
      }
      case "status" -> {
        Migration.Status status = new Migration(api()).status(args[1]);
        System.out.printf(
            "%s: %d users, %d signed in and rehashed, %d still on the legacy hash, %d revoked and awaiting a reset%n",
            args[1], status.total(), status.migrated(), status.pending(), status.awaitingReset());
        status.pendingUsernames().forEach(u -> System.out.println("  pending: " + u));
        System.out.println(
            "live rate: keycloak_credentials_password_hashing_validations_total{algorithm=~\"legacy-.*\"} at /metrics");
      }
      case "revoke" -> {
        boolean notify = Arrays.asList(args).contains("--notify");
        Migration.RevokeResult result = new Migration(api()).revoke(args[1], notify);
        result.usernames().forEach(u -> System.out.println("  revoked, reset required: " + u));
        System.out.printf("%d users past the deadline%s%n", result.revoked(), notify ? ", mailed" : "");
      }
      default -> {
        usage();
        System.exit(2);
      }
    }
  }

  private static void report(int converted, List<String> leftOut, String target) {
    leftOut.forEach(line -> System.out.println("left out: " + line));
    System.out.printf("%d users written to %s, %d left out%n", converted, target, leftOut.size());
  }

  static AdminApi api() {
    String url = env("KLOAKWARE_URL", "http://localhost:8080");
    String realm = env("KLOAKWARE_REALM", "steward");
    String ciSecret = System.getenv("KLOAKWARE_CI_CLIENT_SECRET");
    if (ciSecret != null && !ciSecret.isBlank()) {
      return AdminApi.asServiceAccount(url, realm, env("KLOAKWARE_CI_CLIENT_ID", "kloakware-ci"), ciSecret);
    }
    String user = System.getenv("KEYCLOAK_USER");
    String password = System.getenv("KEYCLOAK_PASSWORD");
    if (user == null || password == null) {
      throw new IllegalStateException(
          "set KLOAKWARE_CI_CLIENT_SECRET for the service account, or KEYCLOAK_USER and KEYCLOAK_PASSWORD");
    }
    return AdminApi.asAdministrator(url, realm, user, password);
  }

  private static String env(String name, String fallback) {
    String value = System.getenv(name);
    return value == null || value.isBlank() ? fallback : value;
  }

  private static void usage() {
    System.err.println(
        "usage: convert-ldif <users.ldif> <users.jsonl> [market-attribute] | convert-csv <users.csv> <users.jsonl>"
            + " | import <users.jsonl> <source> | status <source> | revoke <source> [--notify]");
  }
}
