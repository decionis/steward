# One realm per market, from one template. The single steward realm in
# config/realms is the default model; this is the other column of the
# Architecture guide's table, for a market that needs its own user database,
# its own policy or its own administrators, kept as a variable rather than a
# rewrite.
module "market_realm" {
  source   = "./modules/market-realm"
  for_each = toset(var.markets)

  market                = each.key
  steward_url           = var.steward_url
  steward_client_secret = var.steward_client_secret
}
