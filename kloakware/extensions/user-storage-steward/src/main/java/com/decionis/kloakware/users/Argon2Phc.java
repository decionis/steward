package com.decionis.kloakware.users;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;

/**
 * Steward's password hash: argon2id in the PHC string format every argon2
 * library writes, {@code $argon2id$v=19$m=<KiB>,t=<passes>,p=<lanes>$<salt>$<hash>}
 * with the salt and the hash in unpadded base64. Verified here with the
 * Bouncy Castle generator the server's own argon2 provider uses, in constant
 * time over the hash bytes; the parameters come from the string, so Steward
 * may raise its cost without a change here.
 */
public final class Argon2Phc {

  private static final Pattern PHC =
      Pattern.compile(
          "^\\$argon2id\\$v=19\\$m=(\\d+),t=(\\d+),p=(\\d+)\\$([A-Za-z0-9+/]+)\\$([A-Za-z0-9+/]+)$");

  /** Steward's cost: 64 MiB, three passes, four lanes, a 32-byte tag. */
  static final int MEMORY_KIB = 65_536;
  static final int ITERATIONS = 3;
  static final int PARALLELISM = 4;
  static final int TAG_BYTES = 32;

  private Argon2Phc() {}

  /** True when the password produces the hash the string carries; false for anything else, a malformed string included. */
  public static boolean verify(String phc, String password) {
    if (phc == null || password == null) return false;
    Matcher m = PHC.matcher(phc);
    if (!m.matches()) return false;
    byte[] salt;
    byte[] expected;
    try {
      salt = Base64.getDecoder().decode(m.group(4));
      expected = Base64.getDecoder().decode(m.group(5));
    } catch (IllegalArgumentException malformed) {
      return false;
    }
    byte[] actual =
        derive(
            password,
            salt,
            Integer.parseInt(m.group(1)),
            Integer.parseInt(m.group(2)),
            Integer.parseInt(m.group(3)),
            expected.length);
    return MessageDigest.isEqual(expected, actual);
  }

  /** The PHC string for a password under Steward's cost, for seeding test users. */
  public static String hash(String password, byte[] salt) {
    byte[] tag = derive(password, salt, MEMORY_KIB, ITERATIONS, PARALLELISM, TAG_BYTES);
    Base64.Encoder b64 = Base64.getEncoder().withoutPadding();
    return "$argon2id$v=19$m="
        + MEMORY_KIB
        + ",t="
        + ITERATIONS
        + ",p="
        + PARALLELISM
        + "$"
        + b64.encodeToString(salt)
        + "$"
        + b64.encodeToString(tag);
  }

  private static byte[] derive(
      String password, byte[] salt, int memoryKiB, int iterations, int parallelism, int length) {
    Argon2Parameters parameters =
        new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withMemoryAsKB(memoryKiB)
            .withIterations(iterations)
            .withParallelism(parallelism)
            .withSalt(salt)
            .build();
    Argon2BytesGenerator generator = new Argon2BytesGenerator();
    generator.init(parameters);
    byte[] out = new byte[length];
    generator.generateBytes(password.getBytes(StandardCharsets.UTF_8), out);
    return out;
  }
}
