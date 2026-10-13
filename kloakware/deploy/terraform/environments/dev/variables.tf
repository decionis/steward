variable "environment" {
  description = "dev, qa, staging or prod: the name on every resource and the GitHub environment that applies it."
  type        = string
}

variable "cloud" {
  description = "aws or azure: the platform module that runs; the kloakware module is the same on both."
  type        = string
  validation {
    condition     = contains(["aws", "azure"], var.cloud)
    error_message = "cloud is aws or azure."
  }
}

variable "tier" {
  description = "basic or production."
  type        = string
}

variable "region" {
  description = "The AWS region."
  type        = string
  default     = "eu-north-1"
}

variable "location" {
  description = "The Azure region."
  type        = string
  default     = "swedencentral"
}

variable "dns_zone" {
  description = "The zone the platform manages for this environment, delegated from its parent once."
  type        = string
}

variable "hostname" {
  description = "The hostname kloakware answers on, inside the zone."
  type        = string
}

variable "image" {
  description = "The kloakware image, by digest, from the Kloakware image workflow."
  type        = string
}

variable "steward_url" {
  description = "Where Steward runs for this environment: the realm's redirect URIs and the audit listener's target are built from it."
  type        = string
}

variable "acme_email" {
  description = "For Azure: the address Let's Encrypt notifies about the certificate."
  type        = string
  default     = "ops@example.invalid"
}

variable "realm_secrets" {
  description = "The secrets the realm files take as $(env:...): KLOAKWARE_STEWARD_CLIENT_SECRET, KLOAKWARE_STEWARD_API_SECRET, KLOAKWARE_BROKER_CLIENT_SECRET, KLOAKWARE_LDAP_BIND_PASSWORD, STEWARD_DB_PASSWORD. From the GitHub environment's secret, as a JSON map."
  type        = map(string)
  sensitive   = true
}

variable "audit_webhook_secret" {
  description = "What the audit listener signs each record to Steward with; Steward's STEWARD_AUDIT_WEBHOOK_SECRET is the same value."
  type        = string
  sensitive   = true
}

variable "realm_env_overrides" {
  description = "Non-secret $(env:...) values that differ from the defaults below: the directory's URL, Steward's database, the BankID API."
  type        = map(string)
  default     = {}
}
