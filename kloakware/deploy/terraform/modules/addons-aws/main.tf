# The two controllers on EKS that turn an Ingress into a load balancer and a
# DNS record, installed with the cluster's own Helm provider once the
# platform has made the cluster and the roles their pods assume.

resource "helm_release" "load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  namespace  = "kube-system"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = "3.6.0"

  values = [yamlencode({
    clusterName = var.cluster_name
    region      = var.region
    vpcId       = var.vpc_id
    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
    }
  })]

  depends_on = [terraform_data.ready]
}

resource "helm_release" "external_dns" {
  name       = "external-dns"
  namespace  = "kube-system"
  repository = "https://kubernetes-sigs.github.io/external-dns/"
  chart      = "external-dns"
  version    = "1.23.0"

  values = [yamlencode({
    provider       = { name = "aws" }
    domainFilters  = [var.dns_zone]
    policy         = "sync"
    txtOwnerId     = var.owner
    serviceAccount = { create = true, name = "external-dns" }
  })]

  depends_on = [terraform_data.ready]
}

resource "terraform_data" "ready" {
  input = var.ready
}
