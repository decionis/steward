package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The FAPI 2 Security Profile bound to the two financial-grade clients (K11),
 * driven end to end: a pushed authorisation request authenticated with a
 * client assertion the registered certificate verifies, the login page, the
 * consent the profile demands, the code, and a token that is bound to the
 * sender. For steward-fapi the binding is the client certificate the
 * terminator verified; for steward-fapi-dpop it is the key the client proves
 * with every request. Then the refusals: a token request for the mTLS client
 * without its certificate, the same with a certificate header forged on the
 * plain entry, an assertion signed with an algorithm the profile forbids, and
 * a DPoP token request without a proof.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FinancialGradeTest {

  private static final String ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
  private static final String REDIRECT = "https://steward.example/api/auth/oidc/callback";

  private KloakwareStack stack;
  private Pki pki;

  @BeforeAll
  void useTheSharedStack() {
    stack = SharedStack.get();
    pki = stack.pki();
  }

  @Test
  void theMtlsClientGetsATokenBoundToItsCertificateThroughTheTerminator() throws Exception {
    HttpClient client = pki.httpClient(true, new TrustingCookieJar());
    String issuer = stack.mtlsRealmUrl();
    String verifier = Browser.randomUrlSafe(48);

    String code = signInWithPar(client, issuer, "steward-fapi", verifier);
    Map<String, String> exchange = tokenRequest(issuer, "steward-fapi", code, verifier, pki.clientKey());
    HttpResponse<String> tokens =
        Browser.postForm(client, issuer + "/protocol/openid-connect/token", exchange);
    assertEquals(200, tokens.statusCode(), tokens.body());
    JsonNode body = Tokens.JSON.readTree(tokens.body());

    String accessToken = body.get("access_token").asText();
    assertEquals("PS256", Browser.header(accessToken).get("alg").asText(), "signed as the profile asks");
    assertEquals("PS256", Browser.header(body.get("id_token").asText()).get("alg").asText());
    JsonNode access = Browser.claims(accessToken);
    assertEquals(
        pki.clientCertificateThumbprint(),
        access.path("cnf").path("x5t#S256").asText(),
        "the token names the certificate it is bound to: " + access);
    assertTrue(access.path("steward").path("roles").isArray(), "the steward claim is there: " + access);
    assertEquals(issuer, access.get("iss").asText());

    // The refresh with the certificate goes through; without it, the holder
    // of key check refuses, and a certificate forged in the header on the
    // plain entry is stripped by the proxy before the node sees it.
    String refreshToken = body.get("refresh_token").asText();
    Map<String, String> refresh = refreshRequest(issuer, "steward-fapi", refreshToken, pki.clientKey());
    HttpResponse<String> refreshed =
        Browser.postForm(client, issuer + "/protocol/openid-connect/token", refresh);
    assertEquals(200, refreshed.statusCode(), refreshed.body());
    String rotated = Tokens.JSON.readTree(refreshed.body()).get("refresh_token").asText();

    HttpClient bare = pki.httpClient(false, null);
    HttpResponse<String> withoutCertificate =
        Browser.postForm(
            bare,
            issuer + "/protocol/openid-connect/token",
            refreshRequest(issuer, "steward-fapi", rotated, pki.clientKey()));
    assertEquals(400, withoutCertificate.statusCode(), withoutCertificate.body());
    assertTrue(
        withoutCertificate.body().toLowerCase().contains("certificat"),
        "refused for the missing certificate: " + withoutCertificate.body());

    String plainIssuer = stack.realmUrl();
    HttpResponse<String> forged =
        Browser.postForm(
            Tokens.HTTP,
            plainIssuer + "/protocol/openid-connect/token",
            refreshRequest(plainIssuer, "steward-fapi", rotated, pki.clientKey()),
            Map.of(
                "ssl-client-cert", Browser.encode(pki.clientCertificatePem),
                "ssl-client-verify", "SUCCESS"));
    assertEquals(400, forged.statusCode(), forged.body());
    assertTrue(forged.body().toLowerCase().contains("certificat"), "the forged header was stripped: " + forged.body());
  }

  @Test
  void theDpopClientGetsATokenBoundToTheKeyItProves() throws Exception {
    HttpClient browser = Browser.newBrowser();
    String issuer = stack.realmUrl();
    String verifier = Browser.randomUrlSafe(48);
    KeyPair dpopKey = Jws.rsaKeyPair();
    Map<String, Object> jwk = Jws.jwk((RSAPublicKey) dpopKey.getPublic());
    String tokenEndpoint = issuer + "/protocol/openid-connect/token";

    String code = signInWithPar(browser, issuer, "steward-fapi-dpop", verifier);
    Map<String, String> exchange = tokenRequest(issuer, "steward-fapi-dpop", code, verifier, pki.clientKey());

    // Without the proof the profile refuses; with it the token is DPoP-bound.
    HttpResponse<String> withoutProof = Browser.postForm(browser, tokenEndpoint, exchange);
    assertEquals(400, withoutProof.statusCode(), withoutProof.body());
    assertTrue(withoutProof.body().toLowerCase().contains("dpop"), withoutProof.body());

    HttpResponse<String> tokens =
        Browser.postForm(browser, tokenEndpoint, exchange, Map.of("DPoP", proof(dpopKey, jwk, tokenEndpoint)));
    // The code was consumed by the refused request above only if the server
    // counted it; the profile refuses before redemption, so the same code
    // is still good. If not, the assertion below says so with the body.
    assertEquals(200, tokens.statusCode(), tokens.body());
    JsonNode body = Tokens.JSON.readTree(tokens.body());
    assertEquals("DPoP", body.get("token_type").asText());
    JsonNode access = Browser.claims(body.get("access_token").asText());
    assertEquals(Jws.thumbprint(jwk), access.path("cnf").path("jkt").asText(), "bound to the proved key: " + access);
  }

  @Test
  void anAssertionSignedWithRs256IsRefusedByTheProfile() throws Exception {
    HttpClient client = pki.httpClient(true, null);
    String issuer = stack.mtlsRealmUrl();
    Map<String, String> par = parRequest(issuer, "steward-fapi", Browser.randomUrlSafe(48));
    par.put("client_assertion", assertion(issuer, "steward-fapi", pki.clientKey(), false));
    HttpResponse<String> response =
        Browser.postForm(client, issuer + "/protocol/openid-connect/ext/par/request", par);
    assertNotEquals(201, response.statusCode(), response.body());
    assertTrue(response.statusCode() == 400 || response.statusCode() == 401, response.body());
  }

  @Test
  void anAuthorisationRequestThatWasNotPushedIsRefused() throws Exception {
    HttpClient client = pki.httpClient(true, new TrustingCookieJar());
    String issuer = stack.mtlsRealmUrl();
    Map<String, String> query = new LinkedHashMap<>();
    query.put("client_id", "steward-fapi");
    query.put("response_type", "code");
    query.put("scope", "openid");
    query.put("redirect_uri", REDIRECT);
    query.put("state", Browser.randomUrlSafe(8));
    query.put("code_challenge", Browser.challenge(Browser.randomUrlSafe(48)));
    query.put("code_challenge_method", "S256");
    HttpResponse<String> response =
        Browser.get(client, issuer + "/protocol/openid-connect/auth?" + Browser.form(query));
    assertNotEquals(200, response.statusCode(), "no login page for a request that was not pushed");
  }

  /** PAR, the login page, the consent, the code: what both profiles share. */
  private String signInWithPar(HttpClient client, String issuer, String clientId, String verifier)
      throws Exception {
    String state = Browser.randomUrlSafe(16);
    Map<String, String> par = parRequest(issuer, clientId, verifier);
    par.put("state", state);
    par.put("client_assertion", assertion(issuer, clientId, pki.clientKey(), true));
    HttpResponse<String> pushed =
        Browser.postForm(client, issuer + "/protocol/openid-connect/ext/par/request", par);
    assertEquals(201, pushed.statusCode(), pushed.body());
    String requestUri = Tokens.JSON.readTree(pushed.body()).get("request_uri").asText();

    HttpResponse<String> page =
        Browser.followWithinRealm(
            client,
            Browser.get(
                client,
                issuer
                    + "/protocol/openid-connect/auth?"
                    + Browser.form(Map.of("client_id", clientId, "request_uri", requestUri))),
            issuer);
    assertEquals(200, page.statusCode(), page.headers().firstValue("Location").orElse("") + page.body());

    Map<String, String> credentials = new LinkedHashMap<>();
    credentials.put("username", KloakwareStack.DEV_USER);
    credentials.put("password", stack.devUserPassword);
    credentials.put("credentialId", "");
    HttpResponse<String> afterLogin =
        Browser.followWithinRealm(
            client, Browser.postForm(client, Browser.formAction(page.body(), issuer), credentials), issuer);

    HttpResponse<String> redirect = afterLogin;
    if (afterLogin.statusCode() == 200) {
      // The consent the profile demands, the first time this user meets the client.
      String grant = Browser.hiddenInput(afterLogin.body(), "code");
      assertNotNull(grant, "the consent page: " + afterLogin.body());
      Map<String, String> consent = new LinkedHashMap<>();
      consent.put("code", grant);
      consent.put("accept", "Yes");
      redirect =
          Browser.followWithinRealm(
              client, Browser.postForm(client, Browser.formAction(afterLogin.body(), issuer), consent), issuer);
    }
    assertEquals(302, redirect.statusCode(), redirect.body());
    URI location = URI.create(redirect.headers().firstValue("Location").orElseThrow());
    assertTrue(location.toString().startsWith(REDIRECT + "?"), location.toString());
    Map<String, String> query = Browser.query(location);
    assertEquals(state, query.get("state"));
    assertNotNull(query.get("code"), "a code came back");
    return query.get("code");
  }

  private Map<String, String> parRequest(String issuer, String clientId, String verifier) {
    Map<String, String> par = new LinkedHashMap<>();
    par.put("client_id", clientId);
    par.put("client_assertion_type", ASSERTION_TYPE);
    par.put("response_type", "code");
    par.put("scope", "openid");
    par.put("redirect_uri", REDIRECT);
    par.put("nonce", Browser.randomUrlSafe(16));
    par.put("code_challenge", Browser.challenge(verifier));
    par.put("code_challenge_method", "S256");
    return par;
  }

  private Map<String, String> tokenRequest(
      String issuer, String clientId, String code, String verifier, PrivateKey key) {
    Map<String, String> exchange = new LinkedHashMap<>();
    exchange.put("grant_type", "authorization_code");
    exchange.put("code", code);
    exchange.put("redirect_uri", REDIRECT);
    exchange.put("client_id", clientId);
    exchange.put("client_assertion_type", ASSERTION_TYPE);
    exchange.put("client_assertion", assertion(issuer, clientId, key, true));
    exchange.put("code_verifier", verifier);
    return exchange;
  }

  private Map<String, String> refreshRequest(String issuer, String clientId, String refreshToken, PrivateKey key) {
    Map<String, String> refresh = new LinkedHashMap<>();
    refresh.put("grant_type", "refresh_token");
    refresh.put("refresh_token", refreshToken);
    refresh.put("client_id", clientId);
    refresh.put("client_assertion_type", ASSERTION_TYPE);
    refresh.put("client_assertion", assertion(issuer, clientId, key, true));
    return refresh;
  }

  /** private_key_jwt: the client as issuer and subject, the realm as audience, a minute to live. */
  private static String assertion(String issuer, String clientId, PrivateKey key, boolean ps256) {
    long now = System.currentTimeMillis() / 1000;
    Map<String, Object> claims = new LinkedHashMap<>();
    claims.put("iss", clientId);
    claims.put("sub", clientId);
    claims.put("aud", issuer);
    claims.put("jti", UUID.randomUUID().toString());
    claims.put("iat", now);
    claims.put("exp", now + 60);
    Map<String, Object> header = Map.of("typ", "JWT");
    return ps256 ? Jws.ps256(key, header, claims) : Jws.rs256(key, header, claims);
  }

  /** A DPoP proof for one request: the method and URL, a fresh id, the key in the header. */
  private static String proof(KeyPair key, Map<String, Object> jwk, String url) {
    Map<String, Object> header = new LinkedHashMap<>();
    header.put("typ", "dpop+jwt");
    header.put("jwk", jwk);
    Map<String, Object> claims = new LinkedHashMap<>();
    claims.put("jti", UUID.randomUUID().toString());
    claims.put("htm", "POST");
    claims.put("htu", url);
    claims.put("iat", System.currentTimeMillis() / 1000);
    return Jws.ps256(key.getPrivate(), header, claims);
  }
}
