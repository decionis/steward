variable "acme_email" {
  description = "The address Let's Encrypt notifies about the certificates cert-manager issues."
  type        = string
}

variable "ready" {
  description = "What must exist before cert-manager installs: the routing add-on's DNS role."
  type        = list(string)
  default     = []
}
