package com.decionis.kloakware.users;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class Argon2PhcTest {

  /**
   * Made outside this code, with OpenSSL 3.6: {@code openssl kdf -keylen 32
   * -kdfopt pass:... -kdfopt salt:kloakware-seed-salt -kdfopt iter:3 -kdfopt
   * memcost:65536 -kdfopt lanes:4 ARGON2ID}, then the PHC string by hand.
   */
  static final String OPENSSL_VECTOR =
      "$argon2id$v=19$m=65536,t=3,p=4$a2xvYWt3YXJlLXNlZWQtc2FsdA$VpqgE3NCNDXRFin7D1AZcX2tyYzjb9avYnPG+6S6xtE";

  static final String PASSWORD = "Local-Account-2026!";

  @Test
  void verifiesAHashAnotherImplementationMade() {
    assertTrue(Argon2Phc.verify(OPENSSL_VECTOR, PASSWORD));
    assertFalse(Argon2Phc.verify(OPENSSL_VECTOR, "Local-Account-2026?"));
  }

  @Test
  void hashesAndVerifiesItsOwn() {
    String phc = Argon2Phc.hash(PASSWORD, "kloakware-seed-salt".getBytes(StandardCharsets.UTF_8));
    assertEquals(OPENSSL_VECTOR, phc, "the same cost and salt give the same string");
    assertTrue(Argon2Phc.verify(phc, PASSWORD));
  }

  @Test
  void refusesWhatIsNotAnArgon2idString() {
    assertFalse(Argon2Phc.verify(null, PASSWORD));
    assertFalse(Argon2Phc.verify("", PASSWORD));
    assertFalse(Argon2Phc.verify("$argon2i$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA", PASSWORD));
    assertFalse(Argon2Phc.verify("$argon2id$v=19$m=65536,t=3,p=4$not*base64$aGFzaA", PASSWORD));
    assertFalse(Argon2Phc.verify("$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345", PASSWORD));
    assertFalse(Argon2Phc.verify(OPENSSL_VECTOR, null));
  }
}
