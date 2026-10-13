variable "cluster_name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "dns_zone" {
  description = "The zone external-dns writes records into."
  type        = string
}

variable "owner" {
  description = "The TXT owner id external-dns marks its records with: the platform's name."
  type        = string
}

variable "ready" {
  description = "What must exist before the charts install: the pod identity associations."
  type        = list(string)
  default     = []
}
