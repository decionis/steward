package com.decionis.kloakware.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The three movements of the runbook. Import: the legacy users into the
 * realm through the partial import, in batches, each with a credential the
 * legacy providers verify, their roles and their market, skipping what the
 * realm already has and reporting what the export repeats; re-running it
 * changes nothing. Status: how far the population has moved, since every
 * imported user carries the source they came from and the first sign-in
 * replaces the legacy hash with the realm's. Revoke: past the deadline, the
 * legacy hash of everyone who never signed in is removed and a reset
 * required, with the email that asks for it when a mail server is there.
 */
public final class Migration {

  public static final String SOURCE_ATTRIBUTE = "legacySource";

  public record ImportResult(
      int added, int skippedExisting, int duplicatesInExport, int failed, List<String> notes) {}

  /** Migrated: signed in and rehashed. Pending: still on the legacy hash. Awaiting reset: revoked at the deadline, no password until they reset. */
  public record Status(int total, int migrated, int pending, int awaitingReset, List<String> pendingUsernames) {}

  public record RevokeResult(int revoked, List<String> usernames) {}

  private final AdminApi api;
  private final int batchSize;

  public Migration(AdminApi api) {
    this(api, 100);
  }

  public Migration(AdminApi api, int batchSize) {
    this.api = api;
    this.batchSize = batchSize;
  }

  public ImportResult importUsers(List<LegacyUser> users, String source)
      throws IOException, InterruptedException {
    List<String> notes = new ArrayList<>();
    Set<String> existingEmails = existingEmails();
    Set<String> seenEmails = new HashSet<>();
    Set<String> seenUsernames = new HashSet<>();
    List<LegacyUser> toImport = new ArrayList<>();
    int duplicates = 0;
    int skippedExisting = 0;
    for (LegacyUser user : users) {
      String email = user.email() == null ? null : user.email().toLowerCase(Locale.ROOT);
      String username = user.username().toLowerCase(Locale.ROOT);
      if (!seenUsernames.add(username) || (email != null && !seenEmails.add(email))) {
        duplicates++;
        notes.add("duplicate in the export, skipped: " + user.username() + " <" + user.email() + ">");
        continue;
      }
      if (email != null && existingEmails.contains(email)) {
        skippedExisting++;
        notes.add("already in the realm by email, skipped: " + user.username() + " <" + user.email() + ">");
        continue;
      }
      toImport.add(user);
    }

    int added = 0;
    int failed = 0;
    for (int from = 0; from < toImport.size(); from += batchSize) {
      List<LegacyUser> batch = toImport.subList(from, Math.min(from + batchSize, toImport.size()));
      ObjectNode body = Export.JSON.createObjectNode();
      body.put("ifResourceExists", "SKIP");
      ArrayNode reps = body.putArray("users");
      for (LegacyUser user : batch) reps.add(representation(user, source));
      HttpResponse<String> response = api.send("POST", "/partialImport", body);
      if (response.statusCode() != 200) {
        failed += batch.size();
        notes.add("batch from " + batch.get(0).username() + " refused: " + response.statusCode() + " " + response.body());
        continue;
      }
      JsonNode result = Export.JSON.readTree(response.body());
      added += result.path("added").asInt();
      skippedExisting += result.path("skipped").asInt();
      for (JsonNode item : result.path("results")) {
        if ("SKIPPED".equals(item.path("action").asText())) {
          notes.add("already in the realm, skipped: " + item.path("resourceName").asText());
        }
      }
    }
    return new ImportResult(added, skippedExisting, duplicates, failed, notes);
  }

  /** The realm's representation of one legacy user: the credential in the legacy provider's shape, the source recorded. */
  ObjectNode representation(LegacyUser user, String source) throws IOException {
    ObjectNode rep = Export.JSON.createObjectNode();
    rep.put("username", user.username());
    if (user.email() != null) rep.put("email", user.email());
    if (user.firstName() != null) rep.put("firstName", user.firstName());
    if (user.lastName() != null) rep.put("lastName", user.lastName());
    rep.put("enabled", true);
    // The legacy system verified it; a reset mail to an unverified address is the other way to lock everyone out.
    rep.put("emailVerified", true);
    ArrayNode roles = rep.putArray("realmRoles");
    for (String role : user.roles()) roles.add(role);
    ObjectNode attributes = rep.putObject("attributes");
    attributes.putArray(SOURCE_ATTRIBUTE).add(source);
    if (user.market() != null) {
      rep.putArray("groups").add("/markets/" + user.market());
      attributes.putArray("market").add(user.market());
      // The market chooses the language the realm speaks to the user in (K14).
      attributes.putArray("locale").add(localeFor(user.market()));
    }
    ObjectNode credential = rep.putArray("credentials").addObject();
    credential.put("type", "password");
    credential.put("temporary", false);
    Map<String, Object> credentialData = new LinkedHashMap<>();
    credentialData.put("algorithm", user.password().algorithm());
    credentialData.put("hashIterations", 1);
    credential.put("credentialData", Export.JSON.writeValueAsString(credentialData));
    Map<String, Object> secretData = new LinkedHashMap<>();
    secretData.put("value", user.password().hash());
    secretData.put("salt", user.password().salt());
    credential.put("secretData", Export.JSON.writeValueAsString(secretData));
    return rep;
  }

  /** The language a market's users are addressed in: Swedish in Sweden, German in Germany, English elsewhere. */
  static String localeFor(String market) {
    return switch (market.toUpperCase(Locale.ROOT)) {
      case "SE" -> "sv";
      case "DE" -> "de";
      default -> "en";
    };
  }

  /** Every imported user, by the source attribute, with whether the legacy hash is still what they sign in with. */
  public Status status(String source) throws IOException, InterruptedException {
    int migrated = 0;
    int awaitingReset = 0;
    List<String> pending = new ArrayList<>();
    for (JsonNode user : usersFrom(source)) {
      String algorithm = passwordAlgorithm(user.get("id").asText());
      if (algorithm == null) {
        awaitingReset++;
      } else if (algorithm.startsWith("legacy-")) {
        pending.add(user.get("username").asText());
      } else {
        migrated++;
      }
    }
    return new Status(migrated + pending.size() + awaitingReset, migrated, pending.size(), awaitingReset, pending);
  }

  /** The password credential's algorithm, or null when the user has no password. */
  private String passwordAlgorithm(String userId) throws IOException, InterruptedException {
    for (JsonNode credential : api.get("/users/" + userId + "/credentials")) {
      if (!"password".equals(credential.path("type").asText())) continue;
      return Export.JSON.readTree(credential.path("credentialData").asText("{}")).path("algorithm").asText();
    }
    return null;
  }

  /** Past the deadline: the legacy credential of everyone still on it is removed and a reset required. */
  public RevokeResult revoke(String source, boolean notifyByEmail) throws IOException, InterruptedException {
    List<String> revoked = new ArrayList<>();
    for (JsonNode user : usersFrom(source)) {
      String id = user.get("id").asText();
      String credentialId = stillOnLegacyHash(id);
      if (credentialId == null) continue;
      HttpResponse<String> deleted = api.send("DELETE", "/users/" + id + "/credentials/" + credentialId, null);
      if (deleted.statusCode() != 204) {
        throw new IOException("could not remove the credential of " + user.get("username").asText() + ": " + deleted.body());
      }
      ObjectNode update = (ObjectNode) api.get("/users/" + id);
      update.putArray("requiredActions").add("UPDATE_PASSWORD");
      HttpResponse<String> updated = api.send("PUT", "/users/" + id, update);
      if (updated.statusCode() != 204) {
        throw new IOException("could not require a reset of " + user.get("username").asText() + ": " + updated.body());
      }
      if (notifyByEmail) {
        api.send("PUT", "/users/" + id + "/execute-actions-email", List.of("UPDATE_PASSWORD"));
      }
      revoked.add(user.get("username").asText());
    }
    return new RevokeResult(revoked.size(), revoked);
  }

  /** The password credential's id when its algorithm is a legacy provider's, else null. */
  private String stillOnLegacyHash(String userId) throws IOException, InterruptedException {
    for (JsonNode credential : api.get("/users/" + userId + "/credentials")) {
      if (!"password".equals(credential.path("type").asText())) continue;
      JsonNode data = Export.JSON.readTree(credential.path("credentialData").asText("{}"));
      if (data.path("algorithm").asText().startsWith("legacy-")) return credential.get("id").asText();
    }
    return null;
  }

  private List<JsonNode> usersFrom(String source) throws IOException, InterruptedException {
    List<JsonNode> users = new ArrayList<>();
    for (int first = 0; ; first += 100) {
      JsonNode page =
          api.get(
              "/users?q=" + AdminApi.encode(SOURCE_ATTRIBUTE + ":" + source) + "&first=" + first + "&max=100&briefRepresentation=false");
      for (JsonNode user : page) {
        // A federated store may answer a search it does not understand with
        // everyone it has; only a user that carries the source counts.
        if (user.path("attributes").path(SOURCE_ATTRIBUTE).toString().contains("\"" + source + "\"")) users.add(user);
      }
      if (page.size() < 100) return users;
    }
  }

  private Set<String> existingEmails() throws IOException, InterruptedException {
    Set<String> emails = new HashSet<>();
    for (int first = 0; ; first += 100) {
      JsonNode page = api.get("/users?first=" + first + "&max=100&briefRepresentation=true");
      for (JsonNode user : page) {
        if (user.hasNonNull("email")) emails.add(user.get("email").asText().toLowerCase(Locale.ROOT));
      }
      if (page.size() < 100) return emails;
    }
  }
}
