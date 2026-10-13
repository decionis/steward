variable "name" {
  description = "The platform's name, on every resource: kloakware-<environment>."
  type        = string
}

variable "tier" {
  description = "basic: one zone, one node, the smallest database, no autoscaling. production: three zones, autoscaling, a multi-AZ database, backups, deletion protection."
  type        = string
  validation {
    condition     = contains(["basic", "production"], var.tier)
    error_message = "tier is basic or production."
  }
}

variable "region" {
  description = "The AWS region, for example eu-north-1."
  type        = string
}

variable "dns_zone" {
  description = "The DNS zone this platform creates and manages, for example kloakware-dev.example.com; delegated from its parent by hand once, see the Deployment guide."
  type        = string
}

variable "hostname" {
  description = "The hostname kloakware answers on, inside the DNS zone, for example auth.kloakware-dev.example.com."
  type        = string
}

variable "kubernetes_version" {
  description = "The EKS Kubernetes version."
  type        = string
  default     = "1.34"
}

variable "tags" {
  description = "Tags on every resource."
  type        = map(string)
  default     = {}
}
