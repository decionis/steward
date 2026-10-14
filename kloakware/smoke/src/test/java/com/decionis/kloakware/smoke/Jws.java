package com.decionis.kloakware.smoke;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * Signed JWTs as the financial-grade tests need them, with the JDK alone:
 * PS256, the algorithm the FAPI profile accepts, for the client assertion
 * (private_key_jwt) and for the DPoP proof; a public key as a JWK and its
 * thumbprint, which is what a DPoP-bound token carries.
 */
final class Jws {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

  private Jws() {}

  static String ps256(PrivateKey key, Map<String, Object> header, Map<String, Object> claims) {
    try {
      Map<String, Object> protectedHeader = new LinkedHashMap<>();
      protectedHeader.put("alg", "PS256");
      protectedHeader.putAll(header);
      String signingInput =
          URL.encodeToString(JSON.writeValueAsBytes(protectedHeader))
              + "."
              + URL.encodeToString(JSON.writeValueAsBytes(claims));
      Signature signature = Signature.getInstance("RSASSA-PSS");
      signature.setParameter(
          new PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1));
      signature.initSign(key);
      signature.update(signingInput.getBytes(StandardCharsets.US_ASCII));
      return signingInput + "." + URL.encodeToString(signature.sign());
    } catch (Exception error) {
      throw new IllegalStateException("Signing failed", error);
    }
  }

  /** RS256, which the profile refuses: for the test that proves it does. */
  static String rs256(PrivateKey key, Map<String, Object> header, Map<String, Object> claims) {
    try {
      Map<String, Object> protectedHeader = new LinkedHashMap<>();
      protectedHeader.put("alg", "RS256");
      protectedHeader.putAll(header);
      String signingInput =
          URL.encodeToString(JSON.writeValueAsBytes(protectedHeader))
              + "."
              + URL.encodeToString(JSON.writeValueAsBytes(claims));
      Signature signature = Signature.getInstance("SHA256withRSA");
      signature.initSign(key);
      signature.update(signingInput.getBytes(StandardCharsets.US_ASCII));
      return signingInput + "." + URL.encodeToString(signature.sign());
    } catch (Exception error) {
      throw new IllegalStateException("Signing failed", error);
    }
  }

  static KeyPair rsaKeyPair() {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      return generator.generateKeyPair();
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  /** The public key as a JWK, the members in the order RFC 7638 hashes them. */
  static Map<String, Object> jwk(RSAPublicKey key) {
    Map<String, Object> jwk = new TreeMap<>();
    jwk.put("e", URL.encodeToString(unsigned(key.getPublicExponent().toByteArray())));
    jwk.put("kty", "RSA");
    jwk.put("n", URL.encodeToString(unsigned(key.getModulus().toByteArray())));
    return jwk;
  }

  /** RFC 7638: the SHA-256 of the required members, serialized without whitespace in lexicographic order. */
  static String thumbprint(Map<String, Object> jwk) {
    try {
      Map<String, Object> required = new TreeMap<>();
      required.put("e", jwk.get("e"));
      required.put("kty", jwk.get("kty"));
      required.put("n", jwk.get("n"));
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(required));
      return URL.encodeToString(digest);
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  private static byte[] unsigned(byte[] twosComplement) {
    if (twosComplement.length > 1 && twosComplement[0] == 0) {
      byte[] stripped = new byte[twosComplement.length - 1];
      System.arraycopy(twosComplement, 1, stripped, 0, stripped.length);
      return stripped;
    }
    return twosComplement;
  }
}
