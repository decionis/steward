package com.decionis.kloakware.smoke;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * The steward theme (K14): the login page for the steward client served with
 * the theme's stylesheet and its words in the three languages, the realm's
 * other clients left on Keycloak's own; the BankID step rendered in the
 * language the user's market speaks, from the theme's messages; the mail the
 * realm sends with the theme's subject in that language; and the account
 * console with the theme's stylesheet and title.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ThemeTest {

  private KloakwareStack stack;
  private String admin;

  @BeforeAll
  void useTheSharedStack() throws Exception {
    stack = SharedStack.get();
    admin = Admin.token(stack);
  }

  @Test
  void theStewardClientsLoginPageWearsTheThemeInThreeLanguages() throws Exception {
    HttpResponse<String> english = Browser.get(Browser.newBrowser(), authorizationUrl("steward", null));
    assertEquals(200, english.statusCode(), english.body());
    assertTrue(english.body().contains("/login/steward/css/steward.css"), "the theme's stylesheet: " + head(english.body()));
    assertTrue(english.body().contains("Sign in to Steward"), head(english.body()));

    // A Swedish browser: Accept-Language decides on first contact, before any cookie or user.
    HttpResponse<String> swedish =
        Browser.get(Browser.newBrowser(), authorizationUrl("steward", null), Map.of("Accept-Language", "sv"));
    assertTrue(swedish.body().contains("Logga in på Steward"), head(swedish.body()));
    assertTrue(swedish.body().contains("Användarnamn") || swedish.body().contains("E-post"), "the parent's Swedish for the rest: " + head(swedish.body()));

    HttpResponse<String> german =
        Browser.get(Browser.newBrowser(), authorizationUrl("steward", null), Map.of("Accept-Language", "de"));
    assertTrue(german.body().contains("Bei Steward anmelden"), head(german.body()));
  }

  @Test
  void anotherClientKeepsKeycloaksOwnLoginTheme() throws Exception {
    HttpResponse<String> page = Browser.get(Browser.newBrowser(), authorizationUrl("legacy-dashboard", null));
    assertEquals(200, page.statusCode(), page.body());
    assertFalse(page.body().contains("steward.css"), "no steward stylesheet: " + head(page.body()));
    assertTrue(page.body().contains("Sign in to your account"), head(page.body()));
  }

  @Test
  void theBankIdStepSpeaksTheUsersLanguageFromTheThemesMessages() throws Exception {
    HttpClient browser = Browser.newBrowser();
    HttpResponse<String> login = Browser.get(browser, authorizationUrl("steward", null));
    assertEquals(200, login.statusCode());
    Map<String, String> credentials = new LinkedHashMap<>();
    credentials.put("username", "sven.example");
    credentials.put("password", stack.devUserPassword);
    credentials.put("credentialId", "");
    // No language asked for: sven's locale attribute, sv, decides once he is known.
    HttpResponse<String> bankId =
        Browser.followWithinRealm(
            browser, Browser.postForm(browser, Browser.formAction(login.body(), stack.realmUrl()), credentials), stack.realmUrl());
    assertEquals(200, bankId.statusCode(), bankId.body());
    assertTrue(bankId.body().contains("Bekräfta i BankID"), "the theme's Swedish title: " + head(bankId.body()));
    assertTrue(bankId.body().contains("Jag har bekräftat i BankID"), head(bankId.body()));
    assertTrue(bankId.body().contains("/login/steward/css/steward.css"), head(bankId.body()));

    HttpResponse<String> pending =
        Browser.postForm(browser, Browser.formAction(bankId.body(), stack.realmUrl()), Map.of("continue", "1"));
    assertTrue(pending.body().contains("har inte bekräftat ännu"), "the extension's message, in the theme's Swedish: " + head(pending.body()));
  }

  @Test
  void theMailTheRealmSendsCarriesTheThemesSubjectInTheUsersLanguage() throws Exception {
    JsonNode sven = Admin.user(stack, admin, "sven.example");
    Tokens.HTTP.send(
        HttpRequest.newBuilder(URI.create(stack.mailBaseUrl() + "/")).DELETE().build(), HttpResponse.BodyHandlers.ofString());
    HttpResponse<String> sent =
        Admin.send(stack, admin, "PUT", "/users/" + sven.get("id").asText() + "/execute-actions-email", "[\"UPDATE_PASSWORD\"]");
    assertEquals(204, sent.statusCode(), sent.body());

    JsonNode mail = null;
    for (int attempt = 0; attempt < 50 && mail == null; attempt++) {
      JsonNode messages = Tokens.JSON.readTree(Browser.get(Tokens.HTTP, stack.mailBaseUrl() + "/").body());
      if (messages.size() > 0) mail = messages.get(messages.size() - 1);
      else Thread.sleep(200);
    }
    assertTrue(mail != null, "the sink received the mail");
    assertEquals("Steward: uppdatera ditt konto", mail.get("subject").asText(), mail.toString());
    assertEquals("sven@example.test", mail.get("to").get(0).asText(), mail.toString());
    assertTrue(mail.get("text").asText().contains("/realms/steward/login-actions/action-token"), "the link: " + mail);
  }

  @Test
  void theAccountConsoleWearsTheThemesStylesheetAndTitle() throws Exception {
    HttpResponse<String> console = Browser.get(Browser.newBrowser(), stack.realmUrl() + "/account/");
    assertEquals(200, console.statusCode(), console.body());
    assertTrue(console.body().contains("/account/steward/css/steward.css"), head(console.body()));
    assertTrue(console.body().contains("<title>Steward account</title>"), head(console.body()));
  }

  private String authorizationUrl(String clientId, String locale) {
    Map<String, String> query = new LinkedHashMap<>();
    query.put("client_id", clientId);
    query.put("response_type", "code");
    query.put("scope", "openid");
    query.put(
        "redirect_uri",
        "steward".equals(clientId) ? KloakwareStack.STEWARD_URL + "/api/auth/oidc/callback" : "http://localhost:8082/callback");
    query.put("state", Browser.randomUrlSafe(8));
    query.put("code_challenge", Browser.challenge(Browser.randomUrlSafe(48)));
    query.put("code_challenge_method", "S256");
    if (locale != null) query.put("kc_locale", locale);
    return stack.realmUrl() + "/protocol/openid-connect/auth?" + Browser.form(query);
  }

  private static String head(String html) {
    return html.substring(0, Math.min(1500, html.length()));
  }
}
