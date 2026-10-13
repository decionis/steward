variable "keycloak_url" {
  description = "Where kloakware answers, scheme and host, no path: http://localhost:8080 on a laptop."
  type        = string
}

variable "markets" {
  description = "The markets that get a realm of their own, by code: [\"SE\", \"NG\"]. Each becomes realm steward-<code>."
  type        = list(string)

  validation {
    condition     = alltrue([for m in var.markets : can(regex("^[A-Z]{2}$", m))])
    error_message = "A market is a two-letter upper-case code."
  }
}

variable "steward_url" {
  description = "Where Steward runs, for the redirect and logout URIs of its client in every market realm."
  type        = string
}

variable "steward_client_secret" {
  description = "The steward client's secret, the same in every market realm of one environment. From TF_VAR_steward_client_secret, never from a file."
  type        = string
  sensitive   = true
}
