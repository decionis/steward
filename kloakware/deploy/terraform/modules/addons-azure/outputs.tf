output "ready" {
  description = "What the kloakware module waits for before it applies anything to the cluster."
  value       = [kubectl_manifest.issuer.id]
}
