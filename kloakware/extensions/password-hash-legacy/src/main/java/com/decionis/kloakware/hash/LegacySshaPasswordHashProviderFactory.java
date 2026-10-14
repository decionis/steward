package com.decionis.kloakware.hash;

import org.keycloak.Config;
import org.keycloak.credential.hash.PasswordHashProvider;
import org.keycloak.credential.hash.PasswordHashProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/** Registers `legacy-ssha`, the directory's salted SHA family, as an algorithm the server knows. */
public class LegacySshaPasswordHashProviderFactory implements PasswordHashProviderFactory {

  @Override
  public PasswordHashProvider create(KeycloakSession session) {
    return new LegacySshaPasswordHashProvider();
  }

  @Override
  public String getId() {
    return LegacySsha.ALGORITHM;
  }

  @Override
  public void init(Config.Scope config) {}

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}
}
