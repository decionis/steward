# The contract the kloakware module is built on: the same shape as the AWS
# platform's outputs.

output "cluster" {
  description = "How to reach the cluster: the endpoint, its certificate authority, and the client certificate the cluster's admin credential carries."
  sensitive   = true
  value = {
    name               = azurerm_kubernetes_cluster.this.name
    endpoint           = azurerm_kubernetes_cluster.this.kube_admin_config[0].host
    ca_certificate     = azurerm_kubernetes_cluster.this.kube_admin_config[0].cluster_ca_certificate
    auth               = "client-certificate"
    client_certificate = azurerm_kubernetes_cluster.this.kube_admin_config[0].client_certificate
    client_key         = azurerm_kubernetes_cluster.this.kube_admin_config[0].client_key
  }
}

output "database" {
  description = "Where kloakware's own PostgreSQL answers, and as whom."
  sensitive   = true
  value = {
    host     = azurerm_postgresql_flexible_server.this.fqdn
    port     = 5432
    name     = azurerm_postgresql_flexible_server_database.kloakware.name
    username = azurerm_postgresql_flexible_server.this.administrator_login
    password = random_password.database.result
    secret   = azurerm_key_vault_secret.database.id
  }
}

output "admin" {
  description = "The temporary administrator kloakware starts with, kept in the Key Vault."
  sensitive   = true
  value = {
    username = "admin"
    password = random_password.admin.result
    secret   = azurerm_key_vault_secret.admin.id
  }
}

output "dns" {
  description = "The zone this platform manages, and the name servers its parent must delegate to."
  value = {
    zone         = var.dns_zone
    zone_id      = azurerm_dns_zone.this.id
    name_servers = azurerm_dns_zone.this.name_servers
  }
}

output "ingress" {
  description = "How an Ingress becomes reachable here: the managed ingress-nginx, cert-manager issuing its certificate into the named secret."
  value = {
    class = "webapprouting.kubernetes.azure.com"
    annotations = {
      "cert-manager.io/cluster-issuer"                 = "letsencrypt"
      "nginx.ingress.kubernetes.io/ssl-redirect"       = "true"
      "nginx.ingress.kubernetes.io/force-ssl-redirect" = "true"
    }
    tls_secret = "kloakware-tls"
  }
}

output "certificate" {
  description = "The certificate for the hostname: issued by cert-manager from Let's Encrypt, ending at the ingress."
  value = {
    kind = "cert-manager"
    ref  = "letsencrypt"
  }
}

output "addons" {
  description = "What modules/addons-azure needs: nothing cloud-specific, and what must exist first."
  value = {
    ready = [azurerm_role_assignment.routing_dns.id]
  }
}
