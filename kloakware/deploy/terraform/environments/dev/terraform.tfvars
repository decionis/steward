# dev: applied from master on every merge, the basic tier, AWS. The image is
# the one the Kloakware image workflow published for the merged commit; CI
# passes it as TF_VAR_image, and this value is what a hand apply uses.
environment = "dev"
cloud       = "aws"
tier        = "basic"
dns_zone    = "dev.kloakware.decionis.ai"
hostname    = "auth.dev.kloakware.decionis.ai"
steward_url = "https://steward.dev.kloakware.decionis.ai"
image       = "ghcr.io/decionis/kloakware:master"
