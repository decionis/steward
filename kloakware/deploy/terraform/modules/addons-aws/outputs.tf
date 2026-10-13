output "ready" {
  description = "What the kloakware module waits for before it applies anything to the cluster."
  value       = [helm_release.load_balancer_controller.id, helm_release.external_dns.id]
}
