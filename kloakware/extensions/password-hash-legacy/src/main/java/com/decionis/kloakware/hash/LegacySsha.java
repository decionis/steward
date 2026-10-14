package com.decionis.kloakware.hash;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * The salted SHA family an LDAP directory stores in {@code userPassword}:
 * {@code {SSHA}}, {@code {SSHA256}} and {@code {SSHA512}}, the digest over
 * the password followed by the salt, with the salt appended to the digest
 * and the whole base64. A SiteMinder deployment keeps no password of its
 * own; its user directory keeps these. The scheme is told by the digest's
 * length, so one provider verifies all three, and none of them is good
 * enough to keep.
 */
public final class LegacySsha {

  public static final String ALGORITHM = "legacy-ssha";

  private LegacySsha() {}

  /** The directory's value, {@code {SSHA}base64(digest+salt)}, split into digest and salt. */
  public record Parts(byte[] digest, byte[] salt) {}

  public static Parts parse(String userPassword) {
    if (userPassword == null) throw new IllegalArgumentException("no value");
    String value = userPassword.trim();
    int close = value.indexOf('}');
    if (!value.startsWith("{") || close < 0) {
      throw new IllegalArgumentException("not a {scheme}value password: " + value);
    }
    String scheme = value.substring(1, close).toUpperCase();
    int digestLength =
        switch (scheme) {
          case "SSHA" -> 20;
          case "SSHA256" -> 32;
          case "SSHA512" -> 64;
          default -> throw new IllegalArgumentException("unsupported scheme {" + scheme + "}");
        };
    byte[] decoded = Base64.getDecoder().decode(value.substring(close + 1));
    if (decoded.length <= digestLength) throw new IllegalArgumentException("no salt in the value");
    byte[] digest = new byte[digestLength];
    byte[] salt = new byte[decoded.length - digestLength];
    System.arraycopy(decoded, 0, digest, 0, digestLength);
    System.arraycopy(decoded, digestLength, salt, 0, salt.length);
    return new Parts(digest, salt);
  }

  /** The digest for a stored digest's length: SHA-1 for 20 bytes, SHA-256 for 32, SHA-512 for 64. */
  static String algorithmFor(int digestLength) {
    return switch (digestLength) {
      case 20 -> "SHA-1";
      case 32 -> "SHA-256";
      case 64 -> "SHA-512";
      default -> throw new IllegalArgumentException("no salted SHA has a " + digestLength + "-byte digest");
    };
  }

  public static byte[] hash(String algorithm, String password, byte[] salt) {
    try {
      MessageDigest digest = MessageDigest.getInstance(algorithm);
      digest.update(password.getBytes(StandardCharsets.UTF_8));
      digest.update(salt);
      return digest.digest();
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException(algorithm + " is not available", error);
    }
  }

  public static boolean verify(String password, byte[] salt, byte[] expectedDigest) {
    if (password == null || salt == null || expectedDigest == null) return false;
    String algorithm;
    try {
      algorithm = algorithmFor(expectedDigest.length);
    } catch (IllegalArgumentException wrongLength) {
      return false;
    }
    return MessageDigest.isEqual(expectedDigest, hash(algorithm, password, salt));
  }

  /** Verifies against the credential's base64 fields as the admin API stores them. */
  public static boolean verify(String password, String saltBase64, String digestBase64) {
    if (saltBase64 == null || digestBase64 == null) return false;
    return verify(password, Base64.getDecoder().decode(saltBase64), Base64.getDecoder().decode(digestBase64));
  }
}
