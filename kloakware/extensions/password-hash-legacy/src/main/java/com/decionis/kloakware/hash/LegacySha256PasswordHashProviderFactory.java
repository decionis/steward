package com.decionis.kloakware.hash;

import org.keycloak.Config;
import org.keycloak.credential.hash.PasswordHashProvider;
import org.keycloak.credential.hash.PasswordHashProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/** Registers `legacy-sha256` as a password hash algorithm the server knows. */
public class LegacySha256PasswordHashProviderFactory implements PasswordHashProviderFactory {

  @Override
  public PasswordHashProvider create(KeycloakSession session) {
    return new LegacySha256PasswordHashProvider();
  }

  @Override
  public String getId() {
    return LegacySha256.ALGORITHM;
  }

  @Override
  public void init(Config.Scope config) {}

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}
}
