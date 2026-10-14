package com.decionis.kloakware.hash;

import org.keycloak.credential.hash.PasswordHashProvider;
import org.keycloak.models.PasswordPolicy;
import org.keycloak.models.credential.PasswordCredentialModel;

/**
 * The provider for {@code legacy-ssha}: an LDAP directory's salted SHA, the
 * password a SiteMinder user store kept, imported as a credential with the
 * digest as the value and the salt beside it. Never satisfies the policy,
 * so the first successful sign-in rehashes to the realm's algorithm.
 */
public final class LegacySshaPasswordHashProvider implements PasswordHashProvider {

  @Override
  public boolean policyCheck(PasswordPolicy policy, PasswordCredentialModel credential) {
    return false;
  }

  @Override
  public PasswordCredentialModel encodedCredential(String rawPassword, int iterations) {
    // SHA-256 for a credential a migration script writes through the admin
    // API; the directory's own values arrive already hashed.
    byte[] salt = LegacySha256.newSalt();
    byte[] digest = LegacySsha.hash("SHA-256", rawPassword, salt);
    return PasswordCredentialModel.createFromValues(
        LegacySsha.ALGORITHM, salt, 1, java.util.Base64.getEncoder().encodeToString(digest));
  }

  @Override
  public boolean verify(String rawPassword, PasswordCredentialModel credential) {
    return LegacySsha.verify(
        rawPassword,
        credential.getPasswordSecretData().getSalt(),
        java.util.Base64.getDecoder().decode(credential.getPasswordSecretData().getValue()));
  }

  @Override
  public void close() {}
}
