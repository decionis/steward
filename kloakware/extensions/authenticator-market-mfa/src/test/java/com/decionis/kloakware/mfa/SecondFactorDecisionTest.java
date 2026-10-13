package com.decionis.kloakware.mfa;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SecondFactorDecisionTest {

  @Test
  void aUserOutsideTheConfiguredMarketsNeedsNothing() {
    assertEquals(SecondFactorDecision.NOT_REQUIRED, SecondFactorDecision.decide("SE,NG", "bankid", List.of("DE")));
    assertEquals(SecondFactorDecision.NOT_REQUIRED, SecondFactorDecision.decide("", "bankid", List.of("SE")));
    assertEquals(SecondFactorDecision.NOT_REQUIRED, SecondFactorDecision.decide(null, "otp", List.of()));
  }

  @Test
  void aUserInsideGetsTheConfiguredMethod_otpUnlessBankIdIsNamed() {
    assertEquals(SecondFactorDecision.BANKID, SecondFactorDecision.decide("SE, NG", "bankid", List.of("DE", "se")));
    assertEquals(SecondFactorDecision.OTP, SecondFactorDecision.decide("SE", "otp", List.of("SE")));
    assertEquals(SecondFactorDecision.OTP, SecondFactorDecision.decide("SE", null, List.of("SE")));
    assertEquals(SecondFactorDecision.OTP, SecondFactorDecision.decide("SE", "something-else", List.of("SE")));
  }

  @Test
  void theUsersMarketsComeFromTheMarketsGroupAndTheAttribute() {
    assertEquals(
        Set.of("GB", "NG", "SE"),
        SecondFactorDecision.markets(List.of("/markets/SE", "/markets/NG/ops", "/teams/x", "/markets"), List.of(" GB ", ""), "/markets"));
  }
}
