output "realm" {
  description = "The realm's name."
  value       = keycloak_realm.this.realm
}

output "issuer_path" {
  description = "The issuer path under the server URL."
  value       = "/realms/${keycloak_realm.this.realm}"
}
