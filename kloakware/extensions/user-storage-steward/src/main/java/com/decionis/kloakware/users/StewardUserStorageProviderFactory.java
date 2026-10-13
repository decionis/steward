package com.decionis.kloakware.users;

import java.util.List;
import org.keycloak.component.ComponentModel;
import org.keycloak.component.ComponentValidationException;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.provider.ProviderConfigurationBuilder;
import org.keycloak.storage.UserStorageProviderFactory;

/**
 * Registers the Steward user storage as {@code steward-users}. The realm's
 * component carries the JDBC URL, the user and the password of Steward's
 * database and the prefix Steward's role names take as realm roles;
 * connections are made per lookup, so a database that is down when the
 * realm is applied is not an error, only one when a Steward user signs in.
 */
public final class StewardUserStorageProviderFactory
    implements UserStorageProviderFactory<StewardUserStorageProvider> {

  public static final String ID = "steward-users";
  static final String JDBC_URL = "jdbcUrl";
  static final String JDBC_USER = "jdbcUser";
  static final String JDBC_PASSWORD = "jdbcPassword";
  static final String ROLE_PREFIX = "rolePrefix";
  static final String DEFAULT_ROLE_PREFIX = "steward-";

  private static final List<ProviderConfigProperty> PROPERTIES =
      ProviderConfigurationBuilder.create()
          .property()
          .name(JDBC_URL)
          .label("JDBC URL")
          .helpText("Steward's database, for example jdbc:postgresql://db:5432/steward")
          .type(ProviderConfigProperty.STRING_TYPE)
          .add()
          .property()
          .name(JDBC_USER)
          .label("Database user")
          .helpText("A user with SELECT on Steward's users table and nothing more")
          .type(ProviderConfigProperty.STRING_TYPE)
          .add()
          .property()
          .name(JDBC_PASSWORD)
          .label("Database password")
          .type(ProviderConfigProperty.PASSWORD)
          .secret(true)
          .add()
          .property()
          .name(ROLE_PREFIX)
          .label("Role prefix")
          .helpText("Steward's role ADMIN becomes the realm role <prefix>admin")
          .type(ProviderConfigProperty.STRING_TYPE)
          .defaultValue(DEFAULT_ROLE_PREFIX)
          .add()
          .build();

  @Override
  public StewardUserStorageProvider create(KeycloakSession session, ComponentModel model) {
    StewardUsers users =
        new StewardUsers(model.get(JDBC_URL), model.get(JDBC_USER), model.get(JDBC_PASSWORD));
    return new StewardUserStorageProvider(
        session, model, users, model.get(ROLE_PREFIX, DEFAULT_ROLE_PREFIX));
  }

  @Override
  public void validateConfiguration(KeycloakSession session, RealmModel realm, ComponentModel model)
      throws ComponentValidationException {
    String url = model.get(JDBC_URL);
    if (url == null || !url.startsWith("jdbc:")) {
      throw new ComponentValidationException("steward-users: jdbcUrl must be a JDBC URL");
    }
  }

  @Override
  public String getId() {
    return ID;
  }

  @Override
  public String getHelpText() {
    return "Steward's own users, read-only, imported on first sign-in; passwords verified against Steward's argon2id hashes";
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return PROPERTIES;
  }
}
