package com.decionis.kloakware.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class StewardClaimTest {

  @Test
  void keepsStewardRolesWithoutTheirPrefixAndDropsEverythingElse() {
    StewardClaim claim =
        StewardClaim.build(
            List.of("steward-approver", "default-roles-steward", "offline_access", "steward-viewer", "uma_authorization", "steward-"),
            List.of(),
            List.of(),
            "steward-",
            "/markets");

    assertEquals(List.of("approver", "viewer"), claim.roles());
    assertEquals(List.of(), claim.markets());
  }

  @Test
  void readsMarketsFromTheMarketsGroupAndTheAttribute_onceEach_sorted() {
    StewardClaim claim =
        StewardClaim.build(
            List.of(),
            List.of("/markets/SE", "/markets/NG/ops", "/teams/support", "/markets"),
            List.of("SE", " GB ", ""),
            "steward-",
            "/markets");

    assertEquals(List.of("GB", "NG", "SE"), claim.markets());
  }

  @Test
  void writesTheClaimAsTwoLists() {
    Map<String, Object> map =
        StewardClaim.build(List.of("steward-admin"), List.of("/markets/DE"), List.of(), "steward-", "/markets/")
            .asMap();

    assertEquals(List.of("admin"), map.get("roles"));
    assertEquals(List.of("DE"), map.get("markets"));
    assertEquals(List.of("roles", "markets"), List.copyOf(map.keySet()));
  }
}
