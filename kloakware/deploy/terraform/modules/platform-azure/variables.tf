variable "name" {
  description = "The platform's name, on every resource: kloakware-<environment>."
  type        = string
}

variable "tier" {
  description = "basic: one zone, one node, the smallest database, no autoscaling. production: three zones, autoscaling, a zone-redundant database, backups, deletion protection."
  type        = string
  validation {
    condition     = contains(["basic", "production"], var.tier)
    error_message = "tier is basic or production."
  }
}

variable "location" {
  description = "The Azure region, for example swedencentral."
  type        = string
}

variable "dns_zone" {
  description = "The DNS zone this platform creates and manages, delegated from its parent by hand once."
  type        = string
}

variable "kubernetes_version" {
  description = "The AKS Kubernetes version."
  type        = string
  default     = "1.34"
}

variable "tags" {
  description = "Tags on every resource."
  type        = map(string)
  default     = {}
}
