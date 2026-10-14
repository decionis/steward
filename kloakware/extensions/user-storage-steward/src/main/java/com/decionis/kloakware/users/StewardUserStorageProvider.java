package com.decionis.kloakware.users;

import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.jboss.logging.Logger;
import org.keycloak.component.ComponentModel;
import org.keycloak.credential.CredentialInput;
import org.keycloak.credential.CredentialInputUpdater;
import org.keycloak.credential.CredentialInputValidator;
import org.keycloak.models.GroupModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ModelDuplicateException;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserProvider;
import org.keycloak.models.credential.PasswordCredentialModel;
import org.keycloak.storage.ReadOnlyException;
import org.keycloak.storage.StorageId;
import org.keycloak.storage.UserStoragePrivateUtil;
import org.keycloak.storage.UserStorageProvider;
import org.keycloak.storage.user.ImportedUserValidation;
import org.keycloak.storage.user.UserLookupProvider;
import org.keycloak.storage.user.UserQueryMethodsProvider;

/**
 * Steward's users as a kloakware user storage.
 *
 * <p><b>Import on first sign-in.</b> The first lookup of a Steward user
 * creates their local copy: the same id as in Steward, the email as the
 * username, the display name split in two, the realm roles that carry
 * Steward's role names under the configured prefix. Keycloak then holds
 * their sessions, their consents and the identities a broker links, and
 * every later sign-in finds the copy first.
 *
 * <p><b>Validation on every use.</b> Keycloak asks this provider to validate
 * the copy each time it loads it. The row is read again: gone from Steward,
 * the copy is removed; suspended, the copy is disabled; otherwise the roles
 * are brought in line and the copy is handed back read-only on the fields
 * Steward owns. When Steward's database cannot be reached, the copy is kept
 * as it is, so an outage never deletes users.
 *
 * <p><b>Passwords stay in Steward.</b> A password is verified against
 * Steward's argon2id hash and never stored here; a change is refused with a
 * message that says where to make it. A user without a hash signed in
 * through single sign-on in Steward and cannot use a password here either.
 */
public final class StewardUserStorageProvider
    implements UserStorageProvider,
        UserLookupProvider,
        UserQueryMethodsProvider,
        CredentialInputValidator,
        CredentialInputUpdater,
        ImportedUserValidation {

  private static final Logger LOG = Logger.getLogger(StewardUserStorageProvider.class);

  /** The Steward id, kept on the copy as well as being its own id; declared in the realm's user profile, or Keycloak drops it. */
  static final String ATTRIBUTE_ID = "stewardId";

  private final KeycloakSession session;
  private final ComponentModel model;
  private final StewardUsers users;
  private final String rolePrefix;

  StewardUserStorageProvider(
      KeycloakSession session, ComponentModel model, StewardUsers users, String rolePrefix) {
    this.session = session;
    this.model = model;
    this.users = users;
    this.rolePrefix = rolePrefix;
  }

  // Lookups: the local copy when there is one, else the row, imported.

  @Override
  public UserModel getUserById(RealmModel realm, String id) {
    String external = StorageId.externalId(id);
    return read(() -> users.byId(external)).flatMap(row -> row).map(row -> copyOf(realm, row)).orElse(null);
  }

  @Override
  public UserModel getUserByUsername(RealmModel realm, String username) {
    return read(() -> users.byEmail(username)).flatMap(row -> row).map(row -> copyOf(realm, row)).orElse(null);
  }

  @Override
  public UserModel getUserByEmail(RealmModel realm, String email) {
    return read(() -> users.byEmail(email)).flatMap(row -> row).map(row -> copyOf(realm, row)).orElse(null);
  }

  /** The parameters a search here understands; any other narrows the search to nothing of ours. */
  private static final java.util.Set<String> SEARCHABLE =
      java.util.Set.of(UserModel.SEARCH, UserModel.EMAIL, UserModel.USERNAME, UserModel.FIRST_NAME, UserModel.LAST_NAME, UserModel.EXACT, UserModel.INCLUDE_SERVICE_ACCOUNT, UserModel.EMAIL_VERIFIED, UserModel.ENABLED);

  @Override
  public Stream<UserModel> searchForUserStream(
      RealmModel realm, Map<String, String> params, Integer firstResult, Integer maxResults) {
    // A search by an attribute this store does not have (`q=legacySource:x`,
    // K13) or by a field it cannot filter on is not a search for everyone:
    // answer nothing, so the realm's own users are the only matches.
    for (String key : params.keySet()) {
      if (!SEARCHABLE.contains(key)) return Stream.empty();
    }
    String text =
        Optional.ofNullable(params.get(UserModel.SEARCH))
            .or(() -> Optional.ofNullable(params.get(UserModel.EMAIL)))
            .or(() -> Optional.ofNullable(params.get(UserModel.USERNAME)))
            .orElse("");
    List<StewardUser> rows =
        read(() -> users.search(text, firstResult == null ? 0 : firstResult, maxResults == null ? 100 : maxResults))
            .orElse(List.of());
    return rows.stream().map(row -> copyOf(realm, row)).filter(user -> user != null);
  }

  @Override
  public Stream<UserModel> getGroupMembersStream(
      RealmModel realm, GroupModel group, Integer firstResult, Integer maxResults) {
    return Stream.empty();
  }

  @Override
  public Stream<UserModel> searchForUserByUserAttributeStream(
      RealmModel realm, String attrName, String attrValue) {
    return Stream.empty();
  }

  // Validation of the imported copy, on every load.

  @Override
  public UserModel validate(RealmModel realm, UserModel local) {
    Optional<Optional<StewardUser>> lookup = read(() -> users.byId(stewardId(local)));
    if (lookup.isEmpty()) {
      // Steward's database could not be reached: keep the copy as it is.
      return local;
    }
    Optional<StewardUser> row = lookup.get();
    if (row.isEmpty()) {
      LOG.infof("steward-users: %s is gone from Steward; removing the copy", local.getUsername());
      return null;
    }
    refresh(realm, local, row.get());
    return new ReadOnlyStewardUser(local);
  }

  // Passwords: verified against Steward's hash, never stored here.

  @Override
  public boolean supportsCredentialType(String credentialType) {
    return PasswordCredentialModel.TYPE.equals(credentialType);
  }

  @Override
  public boolean isConfiguredFor(RealmModel realm, UserModel user, String credentialType) {
    if (!supportsCredentialType(credentialType)) return false;
    return read(() -> users.byId(stewardId(user)))
        .flatMap(row -> row)
        .map(StewardUser::hasPassword)
        .orElse(false);
  }

  @Override
  public boolean isValid(RealmModel realm, UserModel user, CredentialInput input) {
    if (!supportsCredentialType(input.getType()) || input.getChallengeResponse() == null) return false;
    Optional<StewardUser> row = read(() -> users.byId(stewardId(user))).flatMap(r -> r);
    if (row.isEmpty() || !row.get().active() || !row.get().hasPassword()) return false;
    return Argon2Phc.verify(row.get().passwordHash(), input.getChallengeResponse());
  }

  @Override
  public boolean updateCredential(RealmModel realm, UserModel user, CredentialInput input) {
    if (!supportsCredentialType(input.getType())) return false;
    throw new ReadOnlyException("Steward owns this password; change it in Steward");
  }

  @Override
  public void disableCredentialType(RealmModel realm, UserModel user, String credentialType) {}

  @Override
  public Stream<String> getDisableableCredentialTypesStream(RealmModel realm, UserModel user) {
    return Stream.empty();
  }

  @Override
  public void close() {}

  // The import.

  private UserModel copyOf(RealmModel realm, StewardUser row) {
    UserProvider local = UserStoragePrivateUtil.userLocalStorage(session);
    UserModel existing = local.getUserById(realm, row.id());
    if (existing != null) {
      refresh(realm, existing, row);
      return new ReadOnlyStewardUser(existing);
    }
    String username = row.email().toLowerCase(Locale.ROOT);
    try {
      UserModel created = local.addUser(realm, row.id(), username, true, false);
      created.setFederationLink(model.getId());
      created.setEmail(row.email());
      created.setEmailVerified(true);
      created.setFirstName(row.firstName());
      created.setLastName(row.lastName());
      created.setSingleAttribute(ATTRIBUTE_ID, row.id());
      refresh(realm, created, row);
      LOG.infof("steward-users: imported %s from Steward", username);
      return new ReadOnlyStewardUser(created);
    } catch (ModelDuplicateException duplicate) {
      // A kloakware user already holds this username or email without being
      // this Steward user. The two must be reconciled by hand; the Steward
      // user cannot sign in here until they are.
      LOG.warnf(
          "steward-users: %s exists in kloakware without being Steward's user %s; not imported",
          username, row.id());
      return null;
    }
  }

  /** The enabled flag and the prefixed realm roles follow Steward; other roles are left alone. */
  private void refresh(RealmModel realm, UserModel local, StewardUser row) {
    if (local.isEnabled() != row.active()) local.setEnabled(row.active());
    List<String> wanted =
        row.roles().stream().map(role -> rolePrefix + role.toLowerCase(Locale.ROOT)).toList();
    local
        .getRealmRoleMappingsStream()
        .filter(role -> role.getName().startsWith(rolePrefix) && !wanted.contains(role.getName()))
        .toList()
        .forEach(local::deleteRoleMapping);
    for (String name : wanted) {
      RoleModel role = realm.getRole(name);
      if (role == null) {
        LOG.warnf("steward-users: realm role %s does not exist; %s keeps signing in without it", name, row.email());
      } else if (!local.hasDirectRole(role)) {
        local.grantRole(role);
      }
    }
  }

  private static String stewardId(UserModel user) {
    String attribute = user.getFirstAttribute(ATTRIBUTE_ID);
    return attribute != null ? attribute : user.getId();
  }

  /** A read of Steward's database; empty when it could not be reached, logged once per call. */
  private <T> Optional<T> read(Query<T> query) {
    try {
      return Optional.ofNullable(query.run());
    } catch (SQLException unreachable) {
      LOG.warnf("steward-users: Steward's database could not be read: %s", unreachable.getMessage());
      return Optional.empty();
    }
  }

  @FunctionalInterface
  private interface Query<T> {
    T run() throws SQLException;
  }
}
