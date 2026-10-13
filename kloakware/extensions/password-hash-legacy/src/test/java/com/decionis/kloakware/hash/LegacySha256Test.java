package com.decionis.kloakware.hash;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class LegacySha256Test {

  /** A vector a migration script can check its own output against: salt "0123456789abcdef", password "Legacy-Sign-In-2026!". */
  private static final String SALT = LegacySha256.encode("0123456789abcdef".getBytes(StandardCharsets.US_ASCII));
  private static final String PASSWORD = "Legacy-Sign-In-2026!";

  @Test
  void hashesTheSaltThenThePassword_andVerifiesOnlyTheRightOne() {
    String hash = LegacySha256.encode(LegacySha256.hash(LegacySha256.decode(SALT), PASSWORD));

    assertEquals(44, hash.length(), "32 bytes, base64");
    assertTrue(LegacySha256.verify(PASSWORD, SALT, hash));
    assertFalse(LegacySha256.verify("Legacy-Sign-In-2026?", SALT, hash));
    assertFalse(LegacySha256.verify(PASSWORD, LegacySha256.encode("fedcba9876543210".getBytes(StandardCharsets.US_ASCII)), hash));
    assertFalse(LegacySha256.verify(null, SALT, hash));
  }

  @Test
  void theProviderNeverPassesThePolicy_soKeycloakRehashesOnSignIn() {
    assertFalse(new LegacySha256PasswordHashProvider().policyCheck(null, null));
    assertEquals(LegacySha256.ALGORITHM, new LegacySha256PasswordHashProviderFactory().getId());
  }

  @Test
  void encodesAFreshSaltEachTime() {
    var provider = new LegacySha256PasswordHashProvider();
    var a = provider.encodedCredential(PASSWORD, 1);
    var b = provider.encodedCredential(PASSWORD, 1);
    assertEquals(LegacySha256.ALGORITHM, a.getPasswordCredentialData().getAlgorithm());
    assertFalse(java.util.Arrays.equals(a.getPasswordSecretData().getSalt(), b.getPasswordSecretData().getSalt()));
    assertTrue(provider.verify(PASSWORD, a) && provider.verify(PASSWORD, b));
  }
}
