# A market's own realm: the same policies, lifetimes, roles and client as the
# shared steward realm in config/realms/steward.json, so that a user, a token
# and an operator's expectations are the same whichever model a market runs
# under. What differs: the market is the realm, so the token's market claim is
# hardcoded rather than read from a group.

locals {
  realm = "steward-${lower(var.market)}"

  roles = {
    "steward-viewer"     = "Sees the queue, the accounts and the evidence. The floor: every signed-in user holds it."
    "steward-operator"   = "Collects signals and works the queue."
    "steward-approver"   = "Records reviews: approve, hold, reject."
    "steward-operations" = "The technical team: signal sources and collections, the workspace connection, health. Records no review."
    "steward-audits"     = "Reads every record Steward keeps. Changes nothing."
    "steward-admin"      = "Everything, including users and the workspace connection."
  }
}

resource "keycloak_realm" "this" {
  realm        = local.realm
  enabled      = true
  display_name = "Steward ${var.market}"
  ssl_required = "external"

  login_with_email_allowed = true
  duplicate_emails_allowed = false
  registration_allowed     = false
  reset_password_allowed   = false
  remember_me              = false
  edit_username_allowed    = false

  default_signature_algorithm = "RS256"

  # The same numbers as steward.json: five minutes for an access token, thirty
  # idle and ten hours at most for a session, refresh tokens revoked on use.
  access_token_lifespan            = "5m"
  access_code_lifespan             = "1m"
  access_code_lifespan_login       = "30m"
  access_code_lifespan_user_action = "5m"
  sso_session_idle_timeout         = "30m"
  sso_session_max_lifespan         = "10h"
  revoke_refresh_token             = true
  refresh_token_max_reuse          = 0

  password_policy = "length(12) and maxLength(128) and digits(1) and lowerCase(1) and upperCase(1) and specialChars(1) and notUsername and notEmail and passwordHistory(5)"

  security_defenses {
    brute_force_detection {
      permanent_lockout                = false
      max_login_failures               = 10
      wait_increment_seconds           = 60
      quick_login_check_milli_seconds  = 1000
      minimum_quick_login_wait_seconds = 60
      max_failure_wait_seconds         = 900
      failure_reset_time_seconds       = 43200
    }
  }
}

resource "keycloak_role" "steward" {
  for_each = local.roles

  realm_id    = keycloak_realm.this.id
  name        = each.key
  description = each.value
}

# Every new user lands on the floor, as in the shared realm.
resource "keycloak_default_roles" "this" {
  realm_id      = keycloak_realm.this.id
  default_roles = ["steward-viewer", "account/view-profile", "account/manage-account"]

  depends_on = [keycloak_role.steward]
}

resource "keycloak_openid_client" "steward" {
  realm_id    = keycloak_realm.this.id
  client_id   = "steward"
  name        = "Steward"
  description = "The Steward application. A confidential client: the Authorization Code flow with PKCE from the server, backchannel logout to the server, no browser-side token."

  access_type   = "CONFIDENTIAL"
  client_secret = var.steward_client_secret

  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = false

  root_url                        = var.steward_url
  base_url                        = "/"
  valid_redirect_uris             = ["${var.steward_url}/api/auth/oidc/callback"]
  valid_post_logout_redirect_uris = ["${var.steward_url}/sign-in"]
  web_origins                     = []

  pkce_code_challenge_method                 = "S256"
  use_refresh_tokens                         = true
  frontchannel_logout_enabled                = false
  backchannel_logout_url                     = "${var.steward_url}/api/auth/oidc/backchannel-logout"
  backchannel_logout_session_required        = true
  backchannel_logout_revoke_offline_sessions = false
}

# The market claim, the same shape as the shared realm's: a list with one code.
resource "keycloak_openid_hardcoded_claim_protocol_mapper" "market" {
  realm_id  = keycloak_realm.this.id
  client_id = keycloak_openid_client.steward.id
  name      = "market"

  claim_name          = "market"
  claim_value         = jsonencode([var.market])
  claim_value_type    = "JSON"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}
