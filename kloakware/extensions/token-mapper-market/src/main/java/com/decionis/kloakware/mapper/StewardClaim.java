package com.decionis.kloakware.mapper;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * The compact claim Steward reads: the user's Steward roles without their
 * prefix, and the markets they work, from the markets group they belong to
 * and from the market attribute. Pure: what goes in is names and paths, what
 * comes out is two sorted lists, so the shape is tested without a server.
 */
public record StewardClaim(List<String> roles, List<String> markets) {

  public static StewardClaim build(
      Collection<String> realmRoleNames,
      Collection<String> groupPaths,
      Collection<String> marketAttribute,
      String rolePrefix,
      String marketsGroupPath) {
    TreeSet<String> roles = new TreeSet<>();
    for (String name : realmRoleNames) {
      if (name != null && name.startsWith(rolePrefix) && name.length() > rolePrefix.length()) {
        roles.add(name.substring(rolePrefix.length()));
      }
    }
    String marketsPrefix = marketsGroupPath.endsWith("/") ? marketsGroupPath : marketsGroupPath + "/";
    TreeSet<String> markets = new TreeSet<>();
    for (String path : groupPaths) {
      if (path != null && path.startsWith(marketsPrefix) && path.length() > marketsPrefix.length()) {
        String rest = path.substring(marketsPrefix.length());
        int slash = rest.indexOf('/');
        markets.add(slash < 0 ? rest : rest.substring(0, slash));
      }
    }
    for (String value : marketAttribute) {
      if (value != null && !value.isBlank()) markets.add(value.trim());
    }
    return new StewardClaim(List.copyOf(roles), List.copyOf(markets));
  }

  /** The claim as it is written into a token. */
  public Map<String, Object> asMap() {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("roles", roles);
    map.put("markets", markets);
    return map;
  }
}
