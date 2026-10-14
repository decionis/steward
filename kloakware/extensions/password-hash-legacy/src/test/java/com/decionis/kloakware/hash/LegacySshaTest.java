package com.decionis.kloakware.hash;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class LegacySshaTest {

  /** Vectors from OpenLDAP's convention, salt "0123456789ab", password "Siteminder-Sign-In-2026!". */
  private static final String PASSWORD = "Siteminder-Sign-In-2026!";
  private static final String SSHA = "{SSHA}NCM/q8zh7nYlPP2M8gigDhy1e+AwMTIzNDU2Nzg5YWI=";
  private static final String SSHA256 = "{SSHA256}jBaAuPNtS8VMNQsG/gIBH/CHpltE60o3S5iDS26M6iEwMTIzNDU2Nzg5YWI=";
  private static final String SSHA512 =
      "{SSHA512}QZlC1J9/e+LWLZomRh7BY4xU8ZHs1PCYTCoFQoAXOuLMWIEJXIFYqce/mGnYQQnoQ9fInoNp9coPKpLvP2RyojAxMjM0NTY3ODlhYg==";

  @Test
  void splitsTheDirectorysValueIntoDigestAndSalt_andVerifiesAllThreeSchemes() {
    for (String value : new String[] {SSHA, SSHA256, SSHA512}) {
      LegacySsha.Parts parts = LegacySsha.parse(value);
      assertArrayEquals("0123456789ab".getBytes(StandardCharsets.US_ASCII), parts.salt(), value);
      assertTrue(LegacySsha.verify(PASSWORD, parts.salt(), parts.digest()), value);
      assertFalse(LegacySsha.verify("Siteminder-Sign-In-2026?", parts.salt(), parts.digest()), value);
    }
    assertEquals(20, LegacySsha.parse(SSHA).digest().length);
    assertEquals(64, LegacySsha.parse(SSHA512).digest().length);
  }

  @Test
  void refusesWhatItDoesNotKnow() {
    assertThrows(IllegalArgumentException.class, () -> LegacySsha.parse("{MD5}abcd"));
    assertThrows(IllegalArgumentException.class, () -> LegacySsha.parse("plaintext"));
    assertThrows(IllegalArgumentException.class, () -> LegacySsha.parse("{SSHA}MDEy"));
    assertFalse(LegacySsha.verify(PASSWORD, new byte[4], new byte[7]), "a digest of no known length");
    assertFalse(LegacySsha.verify(null, "MDEy", "MDEy"));
  }

  @Test
  void theProviderNeverPassesThePolicy_soKeycloakRehashesOnSignIn() {
    assertFalse(new LegacySshaPasswordHashProvider().policyCheck(null, null));
    assertEquals(LegacySsha.ALGORITHM, new LegacySshaPasswordHashProviderFactory().getId());
  }
}
