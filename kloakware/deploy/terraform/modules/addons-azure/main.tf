# cert-manager on AKS, issuing the hostname's certificate from Let's Encrypt
# through the application routing add-on's ingress, installed with the
# cluster's own providers once the platform has made the cluster.

resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  version          = "v1.21.2"

  values = [yamlencode({
    crds = { enabled = true }
  })]

  depends_on = [terraform_data.ready]
}

resource "kubectl_manifest" "issuer" {
  yaml_body = yamlencode({
    apiVersion = "cert-manager.io/v1"
    kind       = "ClusterIssuer"
    metadata   = { name = "letsencrypt" }
    spec = {
      acme = {
        server              = "https://acme-v02.api.letsencrypt.org/directory"
        email               = var.acme_email
        privateKeySecretRef = { name = "letsencrypt-account" }
        solvers = [{
          http01 = { ingress = { ingressClassName = "webapprouting.kubernetes.azure.com" } }
        }]
      }
    }
  })

  depends_on = [helm_release.cert_manager]
}

resource "terraform_data" "ready" {
  input = var.ready
}
