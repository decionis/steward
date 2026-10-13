# One environment of kloakware: the platform for the chosen cloud, then
# kloakware on it. The same file in every environment directory; what
# differs is terraform.tfvars and the state key.

locals {
  name = "kloakware-${var.environment}"
  tags = {
    "kloakware/environment" = var.environment
    "kloakware/managed-by"  = "terraform"
  }

  platform = var.cloud == "aws" ? one(module.aws[*]) : one(module.azure[*])
  cluster  = local.platform.cluster

  # The realm's $(env:...) values: the URL bases, the simulator, and what
  # a directory or a Steward database would be at, overridable per
  # environment; then the secrets.
  realm_env = merge(
    {
      STEWARD_URL            = var.steward_url
      KLOAKWARE_PUBLIC_URL   = "https://${var.hostname}"
      KLOAKWARE_INTERNAL_URL = "http://kloakware-service:8080"
      KLOAKWARE_BANKID_URL   = "http://bankid:8090"
      KLOAKWARE_LDAP_URL     = "ldap://ldap:389"
      STEWARD_DB_JDBC_URL    = "jdbc:postgresql://db:5432/steward"
      STEWARD_DB_USER        = "steward"
    },
    var.realm_env_overrides,
    var.realm_secrets,
  )
}

# --- Providers: the cloud, then the cluster the platform made ---------------

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

provider "azurerm" {
  features {}
}

data "aws_eks_cluster_auth" "this" {
  count = var.cloud == "aws" ? 1 : 0
  name  = local.cluster.name
}

provider "kubernetes" {
  host                   = local.cluster.endpoint
  cluster_ca_certificate = base64decode(local.cluster.ca_certificate)
  token                  = var.cloud == "aws" ? one(data.aws_eks_cluster_auth.this[*]).token : null
  client_certificate     = var.cloud == "azure" ? base64decode(local.cluster.client_certificate) : null
  client_key             = var.cloud == "azure" ? base64decode(local.cluster.client_key) : null
}

provider "kubectl" {
  host                   = local.cluster.endpoint
  cluster_ca_certificate = base64decode(local.cluster.ca_certificate)
  token                  = var.cloud == "aws" ? one(data.aws_eks_cluster_auth.this[*]).token : null
  client_certificate     = var.cloud == "azure" ? base64decode(local.cluster.client_certificate) : null
  client_key             = var.cloud == "azure" ? base64decode(local.cluster.client_key) : null
  load_config_file       = false
}

provider "helm" {
  kubernetes = {
    host                   = local.cluster.endpoint
    cluster_ca_certificate = base64decode(local.cluster.ca_certificate)
    token                  = var.cloud == "aws" ? one(data.aws_eks_cluster_auth.this[*]).token : null
    client_certificate     = var.cloud == "azure" ? base64decode(local.cluster.client_certificate) : null
    client_key             = var.cloud == "azure" ? base64decode(local.cluster.client_key) : null
  }
}

# --- The platform ------------------------------------------------------------

module "aws" {
  source = "../../modules/platform-aws"
  count  = var.cloud == "aws" ? 1 : 0

  name     = local.name
  tier     = var.tier
  region   = var.region
  dns_zone = var.dns_zone
  hostname = var.hostname
  tags     = local.tags
}

module "azure" {
  source = "../../modules/platform-azure"
  count  = var.cloud == "azure" ? 1 : 0

  name     = local.name
  tier     = var.tier
  location = var.location
  dns_zone = var.dns_zone
  tags     = local.tags
}

# --- The add-ons: installed on the cluster with its own providers ------------

module "addons_aws" {
  source = "../../modules/addons-aws"
  count  = var.cloud == "aws" ? 1 : 0

  cluster_name = one(module.aws[*]).addons.cluster_name
  region       = one(module.aws[*]).addons.region
  vpc_id       = one(module.aws[*]).addons.vpc_id
  dns_zone     = one(module.aws[*]).addons.dns_zone
  owner        = one(module.aws[*]).addons.owner
  ready        = one(module.aws[*]).addons.ready
}

module "addons_azure" {
  source = "../../modules/addons-azure"
  count  = var.cloud == "azure" ? 1 : 0

  acme_email = var.acme_email
  ready      = one(module.azure[*]).addons.ready
}

# --- Kloakware on it ---------------------------------------------------------

module "kloakware" {
  source = "../../modules/kloakware"

  name     = "kloakware"
  image    = var.image
  hostname = var.hostname
  tier     = var.tier

  platform = {
    database = local.platform.database
    admin    = local.platform.admin
    ingress  = local.platform.ingress
    ready    = var.cloud == "aws" ? one(module.addons_aws[*]).ready : one(module.addons_azure[*]).ready
  }

  realm_files = {
    "corp.json"    = file("${path.module}/../../../../config/realms/corp.json")
    "steward.json" = file("${path.module}/../../../../config/realms/steward.json")
  }
  realm_env = local.realm_env

  server_options = merge(
    {
      "spi-events-listener-steward-audit-sink-url"    = "${var.steward_url}/api/activities/kloakware"
      "spi-events-listener-steward-audit-sink-secret" = var.audit_webhook_secret
      # Observability (K10): JSON logs for the cloud's log agent; traces to
      # the collector when one is named, sampled off otherwise.
      "log-console-output"    = "json"
      "tracing-sampler-ratio" = var.otel_endpoint == "" ? "0.0" : var.tracing_sampler_ratio
    },
    var.otel_endpoint == "" ? {} : { "tracing-endpoint" = var.otel_endpoint },
  )

  bankid_simulator        = var.tier != "production"
  bankid_simulator_source = file("${path.module}/../../../compose/bankid/Simulator.py")

  depends_on = [module.addons_aws, module.addons_azure]
}

output "issuer" {
  description = "STEWARD_OIDC_ISSUER_URL for the Steward of this environment."
  value       = module.kloakware.issuer
}

output "name_servers" {
  description = "What the parent zone delegates var.dns_zone to."
  value       = local.platform.dns.name_servers
}
