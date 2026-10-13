variable "market" {
  description = "The market code, two upper-case letters; the realm is steward-<code> and the token's market claim is [<code>]."
  type        = string
}

variable "steward_url" {
  description = "Where Steward runs, for the client's redirect and logout URIs."
  type        = string
}

variable "steward_client_secret" {
  description = "The steward client's secret in this realm."
  type        = string
  sensitive   = true
}
