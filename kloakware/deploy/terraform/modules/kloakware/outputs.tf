output "issuer" {
  description = "The issuer Steward is configured with: STEWARD_OIDC_ISSUER_URL."
  value       = "https://${var.hostname}/realms/steward"
}

output "namespace" {
  value = kubernetes_namespace_v1.this.metadata[0].name
}

output "service" {
  description = "The in-cluster address of the server, which the realm's internal URL base and the config-cli Job use."
  value       = "http://${var.name}-service.${kubernetes_namespace_v1.this.metadata[0].name}.svc:8080"
}

output "realm_job" {
  description = "The Job that applied the realm last, named after the realm files' hash."
  value       = kubernetes_job_v1.realm.metadata[0].name
}
