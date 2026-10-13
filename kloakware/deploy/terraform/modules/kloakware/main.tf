# Kloakware on Kubernetes, the same on EKS and AKS: the Keycloak Operator at
# the server's own version, the Keycloak resource pointing at K1's image, the
# realm applied by a config-cli Job that reruns when the realm files change,
# and the autoscaler and disruption budget production needs. What differs by
# cloud arrives in var.platform; nothing here names a cloud.

locals {
  tiers = {
    basic = {
      instances = 1
      requests  = { cpu = "500m", memory = "1536Mi" }
      limits    = { memory = "2Gi" }
      hpa_min   = null
      hpa_max   = null
      pdb_min   = null
      update    = "RecreateOnImageChange"
      spread    = false
    }
    production = {
      instances = 3
      requests  = { cpu = "1", memory = "2Gi" }
      limits    = { memory = "3Gi" }
      hpa_min   = 3
      hpa_max   = 6
      pdb_min   = 2
      update    = "Auto"
      spread    = true
    }
  }
  tier = local.tiers[var.tier]

  labels = {
    "app.kubernetes.io/name"       = "kloakware"
    "app.kubernetes.io/instance"   = var.name
    "app.kubernetes.io/managed-by" = "terraform"
  }

  # The Operator labels its pods; the budget and the spread select on these.
  pod_selector = {
    "app"                        = "keycloak"
    "app.kubernetes.io/instance" = var.name
  }

  realm_hash = substr(sha256(join("\n", [for file in sort(keys(var.realm_files)) : "${file}\n${var.realm_files[file]}"])), 0, 10)
}

resource "kubernetes_namespace_v1" "this" {
  metadata {
    name   = var.namespace
    labels = local.labels
  }
}

# --- The Operator, at the server's version ------------------------------------

data "kubectl_file_documents" "crds" {
  content = join("\n---\n", [
    file("${path.module}/operator/26.8.0-keycloaks.k8s.keycloak.org-v1.yml"),
    file("${path.module}/operator/26.8.0-keycloakrealmimports.k8s.keycloak.org-v1.yml"),
  ])
}

data "kubectl_file_documents" "operator" {
  content = file("${path.module}/operator/26.8.0-kubernetes.yml")
}

# The CRDs are larger than an annotation may hold: server-side apply, as
# kubectl would need too.
resource "kubectl_manifest" "crds" {
  for_each = data.kubectl_file_documents.crds.manifests

  yaml_body         = each.value
  server_side_apply = true
  force_conflicts   = true
  wait_for_rollout  = false
}

resource "kubectl_manifest" "operator" {
  for_each = data.kubectl_file_documents.operator.manifests

  yaml_body          = each.value
  override_namespace = kubernetes_namespace_v1.this.metadata[0].name
  server_side_apply  = true
  force_conflicts    = true

  depends_on = [kubectl_manifest.crds]
}

# --- What the server starts from --------------------------------------------

resource "kubernetes_secret_v1" "database" {
  metadata {
    name      = "${var.name}-database"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  data = {
    username = var.platform.database.username
    password = var.platform.database.password
  }
}

resource "kubernetes_secret_v1" "admin" {
  metadata {
    name      = "${var.name}-bootstrap-admin"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  data = {
    username = var.platform.admin.username
    password = var.platform.admin.password
  }
}

resource "kubernetes_secret_v1" "server_options" {
  metadata {
    name      = "${var.name}-server-options"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  data = var.server_options
}

# --- The Keycloak resource ----------------------------------------------------

resource "kubectl_manifest" "keycloak" {
  yaml_body = yamlencode({
    apiVersion = "k8s.keycloak.org/v2alpha1"
    kind       = "Keycloak"
    metadata = {
      name      = var.name
      namespace = kubernetes_namespace_v1.this.metadata[0].name
      labels    = local.labels
    }
    spec = merge(
      {
        instances      = local.tier.instances
        image          = var.image
        startOptimized = true

        db = {
          vendor         = "postgres"
          host           = var.platform.database.host
          port           = var.platform.database.port
          database       = var.platform.database.name
          usernameSecret = { name = kubernetes_secret_v1.database.metadata[0].name, key = "username" }
          passwordSecret = { name = kubernetes_secret_v1.database.metadata[0].name, key = "password" }
          poolMinSize    = 5
          poolMaxSize    = 50
        }

        # TLS ends at the load balancer or the ingress; the pod speaks HTTP and
        # trusts the proxy's forwarded headers, as it does behind HAProxy on a
        # laptop.
        hostname       = { hostname = "https://${var.hostname}", strict = true }
        http           = { httpEnabled = true }
        proxy          = { headers = "xforwarded" }
        httpManagement = { port = 9000 }

        ingress = merge(
          {
            enabled     = true
            className   = var.platform.ingress.class
            annotations = var.platform.ingress.annotations
          },
          var.platform.ingress.tls_secret == null ? {} : { tlsSecret = var.platform.ingress.tls_secret }
        )

        bootstrapAdmin = { user = { secret = kubernetes_secret_v1.admin.metadata[0].name } }

        resources = {
          requests = local.tier.requests
          limits   = local.tier.limits
        }

        # The Operator's own network policy: only the ingress and the
        # management port's scrapers reach the pods.
        networkPolicy = { enabled = true }

        update = { strategy = local.tier.update }

        additionalOptions = [
          for option in sort(keys(var.server_options)) : {
            name   = option
            secret = { name = kubernetes_secret_v1.server_options.metadata[0].name, key = option }
          }
        ]
      },
      local.tier.spread ? {
        scheduling = {
          topologySpreadConstraints = [{
            maxSkew           = 1
            topologyKey       = "topology.kubernetes.io/zone"
            whenUnsatisfiable = "ScheduleAnyway"
            labelSelector     = { matchLabels = local.pod_selector }
          }]
        }
      } : {}
    )
  })

  server_side_apply = true
  force_conflicts   = true
  wait_for_rollout  = false

  depends_on = [kubectl_manifest.operator]
}

# --- The realm, applied by config-cli, again whenever the files change -------

resource "kubernetes_config_map_v1" "realm" {
  metadata {
    name      = "${var.name}-realm-${local.realm_hash}"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  data = var.realm_files
}

resource "kubernetes_secret_v1" "realm_env" {
  metadata {
    name      = "${var.name}-realm-env"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  data = var.realm_env
}

resource "kubernetes_job_v1" "realm" {
  metadata {
    name      = "${var.name}-realm-${local.realm_hash}"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }

  spec {
    backoff_limit              = 6
    ttl_seconds_after_finished = 86400

    template {
      metadata {
        labels = merge(local.labels, { "app.kubernetes.io/component" = "realm" })
      }
      spec {
        restart_policy = "Never"

        container {
          name  = "config-cli"
          image = var.config_cli_image

          env {
            name  = "KEYCLOAK_URL"
            value = "http://${var.name}-service:8080"
          }
          env {
            name = "KEYCLOAK_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.admin.metadata[0].name
                key  = "username"
              }
            }
          }
          env {
            name = "KEYCLOAK_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.admin.metadata[0].name
                key  = "password"
              }
            }
          }
          env {
            name  = "KEYCLOAK_AVAILABILITYCHECK_ENABLED"
            value = "true"
          }
          env {
            name  = "KEYCLOAK_AVAILABILITYCHECK_TIMEOUT"
            value = "600s"
          }
          env {
            name  = "IMPORT_FILES_LOCATIONS"
            value = join(",", [for file in ["corp.json", "steward.json"] : "/config/${file}" if contains(keys(var.realm_files), file)])
          }
          env {
            name  = "IMPORT_VARSUBSTITUTION_ENABLED"
            value = "true"
          }
          env {
            name  = "IMPORT_CACHE_ENABLED"
            value = "false"
          }
          env_from {
            secret_ref {
              name = kubernetes_secret_v1.realm_env.metadata[0].name
            }
          }

          volume_mount {
            name       = "realm"
            mount_path = "/config"
            read_only  = true
          }
        }

        volume {
          name = "realm"
          config_map {
            name = kubernetes_config_map_v1.realm.metadata[0].name
          }
        }
      }
    }
  }

  # The apply waits for the realm to converge, and fails when it does not.
  wait_for_completion = true
  timeouts {
    create = "20m"
    update = "20m"
  }

  depends_on = [kubectl_manifest.keycloak]
}

# --- Production: scale out, and never all down at once -----------------------

resource "kubernetes_horizontal_pod_autoscaler_v2" "this" {
  count = local.tier.hpa_min == null ? 0 : 1

  metadata {
    name      = var.name
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  spec {
    min_replicas = local.tier.hpa_min
    max_replicas = local.tier.hpa_max

    # The Keycloak resource has a scale subresource over spec.instances.
    scale_target_ref {
      api_version = "k8s.keycloak.org/v2alpha1"
      kind        = "Keycloak"
      name        = var.name
    }

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }
  }

  depends_on = [kubectl_manifest.keycloak]
}

resource "kubernetes_pod_disruption_budget_v1" "this" {
  count = local.tier.pdb_min == null ? 0 : 1

  metadata {
    name      = var.name
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  spec {
    min_available = local.tier.pdb_min
    selector {
      match_labels = local.pod_selector
    }
  }
}

# --- Metrics, once the Prometheus Operator is on the cluster (K10) ------------

resource "kubectl_manifest" "service_monitor" {
  count = var.service_monitor ? 1 : 0

  yaml_body = yamlencode({
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "ServiceMonitor"
    metadata = {
      name      = var.name
      namespace = kubernetes_namespace_v1.this.metadata[0].name
      labels    = local.labels
    }
    spec = {
      selector  = { matchLabels = { "app" = "keycloak", "app.kubernetes.io/instance" = var.name } }
      endpoints = [{ port = "management", path = "/metrics", interval = "30s" }]
    }
  })

  depends_on = [kubectl_manifest.keycloak]
}

# --- The BankID simulator, for environments without an agreement -------------

resource "kubernetes_config_map_v1" "bankid" {
  count = var.bankid_simulator ? 1 : 0

  metadata {
    name      = "bankid-simulator"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  data = { "Simulator.py" = var.bankid_simulator_source }
}

resource "kubernetes_deployment_v1" "bankid" {
  count = var.bankid_simulator ? 1 : 0

  metadata {
    name      = "bankid"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = merge(local.labels, { "app.kubernetes.io/component" = "bankid-simulator" })
  }
  spec {
    replicas = 1
    selector {
      match_labels = { "app.kubernetes.io/component" = "bankid-simulator" }
    }
    template {
      metadata {
        labels = merge(local.labels, { "app.kubernetes.io/component" = "bankid-simulator" })
      }
      spec {
        container {
          name    = "simulator"
          image   = "docker.io/library/python:3-alpine@sha256:15de367b7dfee010efaa3072f82cefc560f4544a11f620943d2a4705d04a2a4f"
          command = ["python3", "-I", "/sim/Simulator.py"]
          port {
            container_port = 8090
          }
          volume_mount {
            name       = "simulator"
            mount_path = "/sim"
            read_only  = true
          }
        }
        volume {
          name = "simulator"
          config_map {
            name = kubernetes_config_map_v1.bankid[0].metadata[0].name
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "bankid" {
  count = var.bankid_simulator ? 1 : 0

  metadata {
    name      = "bankid"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels    = local.labels
  }
  spec {
    selector = { "app.kubernetes.io/component" = "bankid-simulator" }
    port {
      port        = 8090
      target_port = 8090
    }
  }
}
