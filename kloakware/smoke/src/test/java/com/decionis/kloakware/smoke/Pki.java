package com.decionis.kloakware.smoke;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.CookieHandler;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

/**
 * What the certificate maker produced, read out of its container: the
 * stack's authority, which a client here trusts for the terminator, and the
 * steward-fapi client's key pair, which signs the client assertion and is
 * presented at the terminator for the sender-constrained token.
 */
final class Pki {

  final String caCertificatePem;
  final String serverCertificatePem;
  final String serverKeyPem;
  final String clientCertificatePem;
  final String clientKeyPem;
  /** The client's certificate as the realm file registers it: DER, base64, one line. */
  final String clientCertificateBase64Der;

  Pki(
      String caCertificatePem,
      String serverCertificatePem,
      String serverKeyPem,
      String clientCertificatePem,
      String clientKeyPem,
      String clientCertificateBase64Der) {
    this.caCertificatePem = caCertificatePem;
    this.serverCertificatePem = serverCertificatePem;
    this.serverKeyPem = serverKeyPem;
    this.clientCertificatePem = clientCertificatePem;
    this.clientKeyPem = clientKeyPem;
    this.clientCertificateBase64Der = clientCertificateBase64Der.trim();
  }

  PrivateKey clientKey() {
    try {
      String body =
          clientKeyPem
              .replace("-----BEGIN PRIVATE KEY-----", "")
              .replace("-----END PRIVATE KEY-----", "")
              .replaceAll("\\s", "");
      return KeyFactory.getInstance("RSA")
          .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
    } catch (Exception error) {
      throw new IllegalStateException("The client key did not parse", error);
    }
  }

  X509Certificate clientCertificate() {
    return certificate(clientCertificatePem);
  }

  X509Certificate caCertificate() {
    return certificate(caCertificatePem);
  }

  /** The certificate's SHA-256 thumbprint as the cnf claim carries it: x5t#S256. */
  String clientCertificateThumbprint() {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(clientCertificate().getEncoded());
      return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  /**
   * A client for the terminator: trusts the stack's authority, presents the
   * steward-fapi certificate when asked to, and keeps cookies the way the
   * browser tests do when given a jar.
   */
  HttpClient httpClient(boolean presentCertificate, CookieHandler cookies) {
    try {
      KeyStore trust = KeyStore.getInstance(KeyStore.getDefaultType());
      trust.load(null, null);
      trust.setCertificateEntry("kloakware-ca", caCertificate());
      TrustManagerFactory trustManagers =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      trustManagers.init(trust);

      KeyManagerFactory keyManagers = null;
      if (presentCertificate) {
        KeyStore identity = KeyStore.getInstance(KeyStore.getDefaultType());
        identity.load(null, null);
        identity.setKeyEntry(
            "steward-fapi", clientKey(), new char[0], new X509Certificate[] {clientCertificate()});
        keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagers.init(identity, new char[0]);
      }

      SSLContext context = SSLContext.getInstance("TLS");
      context.init(
          keyManagers == null ? null : keyManagers.getKeyManagers(),
          trustManagers.getTrustManagers(),
          null);
      HttpClient.Builder builder =
          HttpClient.newBuilder()
              .sslContext(context)
              .version(HttpClient.Version.HTTP_1_1)
              .followRedirects(HttpClient.Redirect.NEVER);
      if (cookies != null) builder.cookieHandler(cookies);
      return builder.build();
    } catch (Exception error) {
      throw new IllegalStateException("The TLS client could not be built", error);
    }
  }

  private static X509Certificate certificate(String pem) {
    try {
      return (X509Certificate)
          CertificateFactory.getInstance("X.509")
              .generateCertificate(new ByteArrayInputStream(pem.getBytes(StandardCharsets.US_ASCII)));
    } catch (Exception error) {
      throw new IllegalStateException("The certificate did not parse", error);
    }
  }

  static String read(java.io.InputStream stream) throws IOException {
    return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
  }
}
