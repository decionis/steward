variable "name" {
  description = "The Keycloak resource's name; the Operator names its StatefulSet, Service and Ingress after it."
  type        = string
  default     = "kloakware"
}

variable "namespace" {
  description = "The namespace the Operator and kloakware run in; created here."
  type        = string
  default     = "kloakware"
}

variable "image" {
  description = "The kloakware image, by digest: the one the Kloakware image workflow published for the commit or tag being deployed."
  type        = string
}

variable "hostname" {
  description = "The hostname kloakware answers on; the issuer is https://<hostname>/realms/steward."
  type        = string
}

variable "tier" {
  description = "basic: one instance, no autoscaling. production: three instances spread over zones, autoscaling, a disruption budget, the Operator's rolling updates."
  type        = string
  validation {
    condition     = contains(["basic", "production"], var.tier)
    error_message = "tier is basic or production."
  }
}

variable "platform" {
  description = "What the platform module provides, AWS or Azure alike: the database, the temporary administrator, how an Ingress is reached, and what to wait for."
  sensitive   = true
  type = object({
    database = object({
      host     = string
      port     = number
      name     = string
      username = string
      password = string
    })
    admin = object({
      username = string
      password = string
    })
    ingress = object({
      class       = string
      annotations = map(string)
      tls_secret  = optional(string)
    })
    ready = optional(list(string), [])
  })
}

variable "realm_files" {
  description = "The realm files config-cli applies, by file name, in this order: corp.json then steward.json."
  type        = map(string)
}

variable "realm_env" {
  description = "The $(env:...) values the realm files take: URLs and secrets alike; kept in one Secret the config-cli Job reads."
  type        = map(string)
  sensitive   = true
}

variable "server_options" {
  description = "Server options as additionalOptions on the Keycloak resource, by option name without the kc. prefix; secrets among them, kept in one Secret."
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "config_cli_image" {
  description = "keycloak-config-cli, the same image by digest as the compose file runs."
  type        = string
  default     = "docker.io/adorsys/keycloak-config-cli:6.5.1-26.5.5@sha256:0955d98c8a341898b7aa177477edf8a1e90569ae50bbe7598141c1270b773274"
}

variable "bankid_simulator" {
  description = "Run the BankID Relying Party simulator beside kloakware, as the compose file does: for environments without a BankID agreement, never production."
  type        = bool
  default     = false
}

variable "bankid_simulator_source" {
  description = "The simulator's source, the same script the compose file runs."
  type        = string
  default     = ""
}

variable "service_monitor" {
  description = "A ServiceMonitor for the management port, when the Prometheus Operator's CRDs are on the cluster (K10)."
  type        = bool
  default     = false
}
