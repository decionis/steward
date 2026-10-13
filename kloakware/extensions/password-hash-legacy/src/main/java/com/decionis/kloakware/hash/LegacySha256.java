package com.decionis.kloakware.hash;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * The hash a pre-Keycloak system stored: SHA-256 over the salt followed by
 * the password, both the salt and the digest kept as base64. One round, no
 * stretching, which is why it is migrated away from on first sign-in. Pure,
 * so the format is tested against known vectors without a server.
 */
public final class LegacySha256 {

  public static final String ALGORITHM = "legacy-sha256";
  public static final int SALT_BYTES = 16;

  private LegacySha256() {}

  public static byte[] newSalt() {
    byte[] salt = new byte[SALT_BYTES];
    new SecureRandom().nextBytes(salt);
    return salt;
  }

  public static byte[] hash(byte[] salt, String password) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      digest.update(salt);
      digest.update(password.getBytes(StandardCharsets.UTF_8));
      return digest.digest();
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is not available", error);
    }
  }

  public static String encode(byte[] bytes) {
    return Base64.getEncoder().encodeToString(bytes);
  }

  public static byte[] decode(String base64) {
    return Base64.getDecoder().decode(base64);
  }

  public static boolean verify(String password, String saltBase64, String hashBase64) {
    if (password == null || saltBase64 == null || hashBase64 == null) return false;
    byte[] expected = decode(hashBase64);
    byte[] actual = hash(decode(saltBase64), password);
    return MessageDigest.isEqual(expected, actual);
  }
}
