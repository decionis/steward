output "issuers" {
  description = "The issuer URL of each market realm, what Steward's STEWARD_OIDC_ISSUER_URL is set to for that market."
  value       = { for market, realm in module.market_realm : market => "${var.keycloak_url}${realm.issuer_path}" }
}
