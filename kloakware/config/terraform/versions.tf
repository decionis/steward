# The Keycloak provider, under the Keycloak organisation since December 2024
# (Apache-2.0). It talks to the admin API; what it owns here is the realms that
# exist per market, one Terraform resource set per entry in var.markets. The
# shared steward realm is owned by keycloak-config-cli (config/realms), never
# by both: one owner per resource is the rule the Configuration guide explains.
terraform {
  required_version = ">= 1.5"

  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.10"
    }
  }
}
