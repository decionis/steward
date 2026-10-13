package com.decionis.kloakware.mfa;

import java.util.Arrays;
import java.util.Collection;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Whether this user needs a second factor, and which: pure, from the
 * execution's configuration and the user's markets, so the rule is tested
 * without a server. The authenticator is the thin layer that reads the user
 * and acts on the answer.
 */
public enum SecondFactorDecision {
  NOT_REQUIRED,
  OTP,
  BANKID;

  public static final String METHOD_OTP = "otp";
  public static final String METHOD_BANKID = "bankid";

  public static SecondFactorDecision decide(String configuredMarkets, String method, Collection<String> userMarkets) {
    Set<String> required =
        Arrays.stream(configuredMarkets == null ? new String[0] : configuredMarkets.split(","))
            .map(String::trim)
            .filter(market -> !market.isEmpty())
            .map(market -> market.toUpperCase(Locale.ROOT))
            .collect(Collectors.toSet());
    boolean inRequiredMarket =
        userMarkets.stream().map(market -> market.trim().toUpperCase(Locale.ROOT)).anyMatch(required::contains);
    if (!inRequiredMarket) return NOT_REQUIRED;
    return METHOD_BANKID.equalsIgnoreCase(method == null ? "" : method.trim()) ? BANKID : OTP;
  }

  /** The markets a user works: the subgroups of the markets group they belong to, and the market attribute. */
  public static Set<String> markets(Collection<String> groupPaths, Collection<String> attribute, String marketsGroupPath) {
    String prefix = marketsGroupPath.endsWith("/") ? marketsGroupPath : marketsGroupPath + "/";
    Set<String> markets =
        groupPaths.stream()
            .filter(path -> path != null && path.startsWith(prefix) && path.length() > prefix.length())
            .map(path -> path.substring(prefix.length()))
            .map(rest -> rest.contains("/") ? rest.substring(0, rest.indexOf('/')) : rest)
            .collect(Collectors.toCollection(java.util.TreeSet::new));
    attribute.stream().filter(value -> value != null && !value.isBlank()).map(String::trim).forEach(markets::add);
    return markets;
  }
}
