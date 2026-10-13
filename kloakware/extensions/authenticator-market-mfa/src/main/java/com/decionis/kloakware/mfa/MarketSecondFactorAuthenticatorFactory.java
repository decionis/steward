package com.decionis.kloakware.mfa;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

/**
 * The factory behind the `steward-market-second-factor` authenticator: what
 * the Admin UI and the realm file see, the configuration each execution of
 * it carries, and the requirement choices a flow may give it.
 */
public class MarketSecondFactorAuthenticatorFactory implements AuthenticatorFactory {

  public static final String ID = "steward-market-second-factor";
  public static final String MARKETS = "markets";
  public static final String METHOD = "method";
  public static final String BANKID_URL = "bankid.url";
  public static final String PERSONAL_NUMBER_ATTRIBUTE = "bankid.personal-number-attribute";
  public static final String MARKETS_GROUP_PATH = "markets.group.path";
  public static final String MARKET_ATTRIBUTE = "market.attribute";

  private static final AuthenticationExecutionModel.Requirement[] REQUIREMENTS = {
    AuthenticationExecutionModel.Requirement.REQUIRED, AuthenticationExecutionModel.Requirement.DISABLED
  };

  private static final List<ProviderConfigProperty> PROPERTIES =
      List.of(
          property(MARKETS, "Markets", "The markets whose users need a second factor, comma-separated codes: SE,NG.", ProviderConfigProperty.STRING_TYPE, "SE"),
          listProperty(METHOD, "Method", "otp: a TOTP, set up on the spot if missing. bankid: the BankID-shaped step.", "otp", SecondFactorDecision.METHOD_OTP, SecondFactorDecision.METHOD_BANKID),
          property(BANKID_URL, "BankID RP URL", "Where the BankID Relying Party API answers; the simulator on a laptop.", ProviderConfigProperty.STRING_TYPE, "http://bankid:8090"),
          property(PERSONAL_NUMBER_ATTRIBUTE, "Personal number attribute", "The user attribute holding the personal number BankID must confirm.", ProviderConfigProperty.STRING_TYPE, "personalNumber"),
          property(MARKETS_GROUP_PATH, "Markets group path", "The group whose subgroups are the markets.", ProviderConfigProperty.STRING_TYPE, "/markets"),
          property(MARKET_ATTRIBUTE, "Market attribute", "The user attribute that names markets directly.", ProviderConfigProperty.STRING_TYPE, "market"));

  @Override
  public Authenticator create(KeycloakSession session) {
    return new MarketSecondFactorAuthenticator();
  }

  @Override
  public String getId() {
    return ID;
  }

  @Override
  public String getDisplayType() {
    return "Steward: second factor by market";
  }

  @Override
  public String getReferenceCategory() {
    return "mfa";
  }

  @Override
  public boolean isConfigurable() {
    return true;
  }

  @Override
  public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
    return REQUIREMENTS;
  }

  @Override
  public boolean isUserSetupAllowed() {
    return false;
  }

  @Override
  public String getHelpText() {
    return "Requires a second factor from users who work a configured market: TOTP, or a BankID-shaped step. A pass-through for everyone else.";
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return PROPERTIES;
  }

  @Override
  public void init(Config.Scope config) {}

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}

  private static ProviderConfigProperty property(String name, String label, String help, String type, Object defaultValue) {
    return new ProviderConfigProperty(name, label, help, type, defaultValue);
  }

  private static ProviderConfigProperty listProperty(String name, String label, String help, String defaultValue, String... options) {
    ProviderConfigProperty property = new ProviderConfigProperty(name, label, help, ProviderConfigProperty.LIST_TYPE, defaultValue);
    property.setOptions(List.of(options));
    return property;
  }
}
