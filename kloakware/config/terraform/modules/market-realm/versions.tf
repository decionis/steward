# Without this, Terraform assumes hashicorp/keycloak for the resources below
# and the module cannot be initialised. The version is pinned by the root.
terraform {
  required_providers {
    keycloak = {
      source = "keycloak/keycloak"
    }
  }
}
