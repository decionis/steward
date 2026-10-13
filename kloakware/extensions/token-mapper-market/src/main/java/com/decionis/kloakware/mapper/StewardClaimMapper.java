package com.decionis.kloakware.mapper;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.keycloak.models.ClientSessionContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ProtocolMapperModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserSessionModel;
import org.keycloak.models.utils.KeycloakModelUtils;
import org.keycloak.models.utils.RoleUtils;
import org.keycloak.protocol.oidc.mappers.AbstractOIDCProtocolMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAccessTokenMapper;
import org.keycloak.protocol.oidc.mappers.OIDCAttributeMapperHelper;
import org.keycloak.protocol.oidc.mappers.OIDCIDTokenMapper;
import org.keycloak.protocol.oidc.mappers.TokenIntrospectionTokenMapper;
import org.keycloak.protocol.oidc.mappers.UserInfoTokenMapper;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.representations.IDToken;

/**
 * The protocol mapper behind the `steward` claim: a ProtocolMapper SPI
 * provider, registered through META-INF/services, configured per client
 * scope in the realm file, compiled into the server by the Dockerfile.
 *
 * <p>Roles come from the user's effective realm roles, composites and groups
 * expanded, not from the client session's scope, so the claim says what the
 * user holds whatever the client's scope mappings are; the client's scope
 * decides whether the claim is present at all. Markets come from the markets
 * group and the market attribute.
 */
public class StewardClaimMapper extends AbstractOIDCProtocolMapper
    implements OIDCAccessTokenMapper,
        OIDCIDTokenMapper,
        UserInfoTokenMapper,
        TokenIntrospectionTokenMapper {

  public static final String PROVIDER_ID = "steward-claim-mapper";
  public static final String ROLE_PREFIX = "role.prefix";
  public static final String MARKETS_GROUP_PATH = "markets.group.path";
  public static final String MARKET_ATTRIBUTE = "market.attribute";

  private static final List<ProviderConfigProperty> PROPERTIES = new ArrayList<>();

  static {
    PROPERTIES.add(
        new ProviderConfigProperty(
            ROLE_PREFIX,
            "Role prefix",
            "Realm roles with this prefix are Steward's; the prefix is removed in the claim.",
            ProviderConfigProperty.STRING_TYPE,
            "steward-"));
    PROPERTIES.add(
        new ProviderConfigProperty(
            MARKETS_GROUP_PATH,
            "Markets group path",
            "The group whose subgroups are the markets.",
            ProviderConfigProperty.STRING_TYPE,
            "/markets"));
    PROPERTIES.add(
        new ProviderConfigProperty(
            MARKET_ATTRIBUTE,
            "Market attribute",
            "The user attribute that names markets directly.",
            ProviderConfigProperty.STRING_TYPE,
            "market"));
    OIDCAttributeMapperHelper.addTokenClaimNameConfig(PROPERTIES);
    OIDCAttributeMapperHelper.addIncludeInTokensConfig(PROPERTIES, StewardClaimMapper.class);
  }

  @Override
  public String getId() {
    return PROVIDER_ID;
  }

  @Override
  public String getDisplayType() {
    return "Steward claim";
  }

  @Override
  public String getDisplayCategory() {
    return TOKEN_MAPPER_CATEGORY;
  }

  @Override
  public String getHelpText() {
    return "One claim with the user's Steward roles and markets: what Steward needs and nothing else.";
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return PROPERTIES;
  }

  @Override
  protected void setClaim(
      IDToken token,
      ProtocolMapperModel model,
      UserSessionModel userSession,
      KeycloakSession session,
      ClientSessionContext clientSessionContext) {
    UserModel user = userSession.getUser();
    String rolePrefix = setting(model, ROLE_PREFIX, "steward-");
    String marketsPath = setting(model, MARKETS_GROUP_PATH, "/markets");
    String marketAttribute = setting(model, MARKET_ATTRIBUTE, "market");

    List<String> realmRoles =
        RoleUtils.getDeepUserRoleMappings(user).stream()
            .filter(role -> !role.isClientRole())
            .map(RoleModel::getName)
            .collect(Collectors.toList());
    List<String> groupPaths =
        user.getGroupsStream()
            .map(KeycloakModelUtils::buildGroupPath)
            .collect(Collectors.toList());
    List<String> attribute = user.getAttributeStream(marketAttribute).collect(Collectors.toList());

    StewardClaim claim = StewardClaim.build(realmRoles, groupPaths, attribute, rolePrefix, marketsPath);
    String claimName = setting(model, OIDCAttributeMapperHelper.TOKEN_CLAIM_NAME, "steward");
    token.getOtherClaims().put(claimName, claim.asMap());
  }

  private static String setting(ProtocolMapperModel model, String key, String fallback) {
    String value = model.getConfig() == null ? null : model.getConfig().get(key);
    return value == null || value.isBlank() ? fallback : value;
  }
}
