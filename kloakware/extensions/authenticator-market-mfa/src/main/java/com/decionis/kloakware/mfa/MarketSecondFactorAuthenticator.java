package com.decionis.kloakware.mfa;

import static com.decionis.kloakware.mfa.MarketSecondFactorAuthenticatorFactory.BANKID_URL;
import static com.decionis.kloakware.mfa.MarketSecondFactorAuthenticatorFactory.MARKETS;
import static com.decionis.kloakware.mfa.MarketSecondFactorAuthenticatorFactory.MARKETS_GROUP_PATH;
import static com.decionis.kloakware.mfa.MarketSecondFactorAuthenticatorFactory.MARKET_ATTRIBUTE;
import static com.decionis.kloakware.mfa.MarketSecondFactorAuthenticatorFactory.METHOD;
import static com.decionis.kloakware.mfa.MarketSecondFactorAuthenticatorFactory.PERSONAL_NUMBER_ATTRIBUTE;

import jakarta.ws.rs.core.Response;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.OTPCredentialModel;
import org.keycloak.models.utils.KeycloakModelUtils;

/**
 * The second factor by market. Placed after the password form: for a user
 * outside the configured markets it succeeds at once; for one inside, with
 * the OTP method, it makes sure a TOTP exists (setting it up as a required
 * action if not) and lets the OTP step that follows enforce it; with the
 * BankID method it starts an order, shows the page, and on each return
 * collects until the order completes for the personal number the user's
 * attribute names.
 */
public final class MarketSecondFactorAuthenticator implements Authenticator {

  static final String TEMPLATE = "steward-bankid.ftl";
  static final String NOTE_ORDER = "steward.bankid.orderRef";

  private static final Logger LOG = Logger.getLogger(MarketSecondFactorAuthenticator.class);

  @Override
  public void authenticate(AuthenticationFlowContext context) {
    Map<String, String> config = config(context);
    UserModel user = context.getUser();
    Set<String> markets =
        SecondFactorDecision.markets(
            user.getGroupsStream().map(KeycloakModelUtils::buildGroupPath).collect(Collectors.toList()),
            user.getAttributeStream(setting(config, MARKET_ATTRIBUTE, "market")).collect(Collectors.toList()),
            setting(config, MARKETS_GROUP_PATH, "/markets"));
    SecondFactorDecision decision =
        SecondFactorDecision.decide(setting(config, MARKETS, "SE"), setting(config, METHOD, "otp"), markets);

    switch (decision) {
      case NOT_REQUIRED -> context.success();
      case OTP -> {
        if (!user.credentialManager().isConfiguredFor(OTPCredentialModel.TYPE)) {
          user.addRequiredAction(UserModel.RequiredAction.CONFIGURE_TOTP);
        }
        context.success();
      }
      case BANKID -> startBankId(context, config, user);
    }
  }

  @Override
  public void action(AuthenticationFlowContext context) {
    Map<String, String> config = config(context);
    String orderRef = context.getAuthenticationSession().getAuthNote(NOTE_ORDER);
    if (orderRef == null) {
      startBankId(context, config, context.getUser());
      return;
    }
    BankIdClient bankId = new BankIdClient(setting(config, BANKID_URL, "http://bankid:8090"));
    try {
      BankIdClient.Collect collect = bankId.collect(orderRef);
      if (collect.complete()) {
        String expected =
            context.getUser().getFirstAttribute(setting(config, PERSONAL_NUMBER_ATTRIBUTE, "personalNumber"));
        if (expected == null || !expected.equals(collect.personalNumber())) {
          LOG.warnf("BankID completed for a personal number that is not the user's");
          context.getAuthenticationSession().removeAuthNote(NOTE_ORDER);
          context.failureChallenge(AuthenticationFlowError.INVALID_USER, page(context, "stewardBankIdWrongPerson", null));
          return;
        }
        context.getAuthenticationSession().removeAuthNote(NOTE_ORDER);
        context.success();
      } else if (collect.failed()) {
        context.getAuthenticationSession().removeAuthNote(NOTE_ORDER);
        context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, page(context, "stewardBankIdFailed", collect.hintCode()));
      } else {
        context.challenge(page(context, "stewardBankIdPending", collect.hintCode()));
      }
    } catch (Exception error) {
      LOG.warnf("BankID collect failed: %s", error.getMessage());
      context.failureChallenge(AuthenticationFlowError.INTERNAL_ERROR, page(context, "stewardBankIdUnavailable", null));
    }
  }

  private void startBankId(AuthenticationFlowContext context, Map<String, String> config, UserModel user) {
    BankIdClient bankId = new BankIdClient(setting(config, BANKID_URL, "http://bankid:8090"));
    String personalNumber = user.getFirstAttribute(setting(config, PERSONAL_NUMBER_ATTRIBUTE, "personalNumber"));
    try {
      BankIdClient.Order order = bankId.auth(context.getConnection().getRemoteAddr(), personalNumber);
      context.getAuthenticationSession().setAuthNote(NOTE_ORDER, order.orderRef());
      context.challenge(page(context, null, null));
    } catch (Exception error) {
      LOG.warnf("BankID auth failed: %s", error.getMessage());
      context.failureChallenge(AuthenticationFlowError.INTERNAL_ERROR, page(context, "stewardBankIdUnavailable", null));
    }
  }

  private static Response page(AuthenticationFlowContext context, String messageKey, String hintCode) {
    var form = context.form().setAttribute("hintCode", hintCode == null ? "" : hintCode);
    if (messageKey != null) form.setError(messageKey);
    return form.createForm(TEMPLATE);
  }

  private static Map<String, String> config(AuthenticationFlowContext context) {
    AuthenticatorConfigModel model = context.getAuthenticatorConfig();
    return model == null || model.getConfig() == null ? Map.of() : model.getConfig();
  }

  private static String setting(Map<String, String> config, String key, String fallback) {
    String value = config.get(key);
    return value == null || value.isBlank() ? fallback : value;
  }

  @Override
  public boolean requiresUser() {
    return true;
  }

  @Override
  public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
    return true;
  }

  @Override
  public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}

  @Override
  public void close() {}
}
