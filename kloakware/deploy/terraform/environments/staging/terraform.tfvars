# staging: the production tier, so what production does is rehearsed here.
environment = "staging"
cloud       = "aws"
tier        = "production"
dns_zone    = "staging.kloakware.decionis.ai"
hostname    = "auth.staging.kloakware.decionis.ai"
steward_url = "https://steward.staging.kloakware.decionis.ai"
image       = "ghcr.io/decionis/kloakware:master"
