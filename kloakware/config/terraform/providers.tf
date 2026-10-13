# Credentials come from the environment, never from a file in this tree:
# KEYCLOAK_USER and KEYCLOAK_PASSWORD, the bootstrap admin on a laptop and in
# the drift job. K11 replaces them with a least-privilege service account and
# KEYCLOAK_CLIENT_SECRET.
provider "keycloak" {
  url       = var.keycloak_url
  client_id = "admin-cli"
}
