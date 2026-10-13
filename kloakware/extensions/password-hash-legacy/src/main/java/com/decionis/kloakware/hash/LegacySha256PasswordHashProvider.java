package com.decionis.kloakware.hash;

import org.keycloak.credential.hash.PasswordHashProvider;
import org.keycloak.models.PasswordPolicy;
import org.keycloak.models.credential.PasswordCredentialModel;

/**
 * The provider Keycloak asks to verify a credential whose algorithm is
 * `legacy-sha256`. It can encode too, so that a migration script may write
 * legacy-shaped credentials through the admin API; it never claims to satisfy
 * the realm's policy, so Keycloak rehashes on the first successful sign-in.
 */
public final class LegacySha256PasswordHashProvider implements PasswordHashProvider {

  @Override
  public boolean policyCheck(PasswordPolicy policy, PasswordCredentialModel credential) {
    // False whatever the policy says: a legacy hash is never good enough to
    // keep, and false is what makes Keycloak replace it after a valid sign-in.
    return false;
  }

  @Override
  public PasswordCredentialModel encodedCredential(String rawPassword, int iterations) {
    byte[] salt = LegacySha256.newSalt();
    String hash = LegacySha256.encode(LegacySha256.hash(salt, rawPassword));
    return PasswordCredentialModel.createFromValues(LegacySha256.ALGORITHM, salt, 1, hash);
  }

  @Override
  public boolean verify(String rawPassword, PasswordCredentialModel credential) {
    return LegacySha256.verify(
        rawPassword,
        LegacySha256.encode(credential.getPasswordSecretData().getSalt()),
        credential.getPasswordSecretData().getValue());
  }

  @Override
  public void close() {}
}
