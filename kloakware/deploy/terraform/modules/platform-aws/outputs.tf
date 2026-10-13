# The contract the kloakware module is built on: the same shape as the Azure
# platform's outputs, so the module does not know which cloud it is on.

output "cluster" {
  description = "How to reach the cluster: the endpoint, its certificate authority, and the name a token is minted for."
  value = {
    name           = module.eks.cluster_name
    endpoint       = module.eks.cluster_endpoint
    ca_certificate = module.eks.cluster_certificate_authority_data
    auth           = "eks-token"
  }
}

output "database" {
  description = "Where kloakware's own PostgreSQL answers, and as whom."
  sensitive   = true
  value = {
    host     = module.database.cluster_endpoint
    port     = module.database.cluster_port
    name     = module.database.cluster_database_name
    username = jsondecode(data.aws_secretsmanager_secret_version.database.secret_string).username
    password = jsondecode(data.aws_secretsmanager_secret_version.database.secret_string).password
    secret   = module.database.cluster_master_user_secret[0].secret_arn
  }
}

output "admin" {
  description = "The temporary administrator kloakware starts with, kept in Secrets Manager."
  sensitive   = true
  value = {
    username = "admin"
    password = random_password.admin.result
    secret   = aws_secretsmanager_secret.admin.arn
  }
}

output "dns" {
  description = "The zone this platform manages, and the name servers its parent must delegate to."
  value = {
    zone         = var.dns_zone
    zone_id      = aws_route53_zone.this.zone_id
    name_servers = aws_route53_zone.this.name_servers
  }
}

output "ingress" {
  description = "How an Ingress becomes reachable here: the class and the annotations the kloakware module adds, TLS ending at the load balancer with the ACM certificate."
  value = {
    class = "alb"
    annotations = {
      "alb.ingress.kubernetes.io/scheme"           = "internet-facing"
      "alb.ingress.kubernetes.io/target-type"      = "ip"
      "alb.ingress.kubernetes.io/listen-ports"     = jsonencode([{ HTTP = 80 }, { HTTPS = 443 }])
      "alb.ingress.kubernetes.io/ssl-redirect"     = "443"
      "alb.ingress.kubernetes.io/certificate-arn"  = aws_acm_certificate_validation.this.certificate_arn
      "alb.ingress.kubernetes.io/healthcheck-path" = "/health/ready"
      "alb.ingress.kubernetes.io/healthcheck-port" = "9000"
    }
    tls_secret = null
  }
}

output "certificate" {
  description = "The certificate for the hostname: ACM, terminated at the load balancer."
  value = {
    kind = "acm"
    ref  = aws_acm_certificate_validation.this.certificate_arn
  }
}

output "addons" {
  description = "What modules/addons-aws needs to install the controllers on this cluster."
  value = {
    cluster_name = module.eks.cluster_name
    region       = var.region
    vpc_id       = module.vpc.vpc_id
    dns_zone     = var.dns_zone
    owner        = var.name
    ready        = [aws_eks_pod_identity_association.load_balancer_controller.id, aws_eks_pod_identity_association.external_dns.id]
  }
}
