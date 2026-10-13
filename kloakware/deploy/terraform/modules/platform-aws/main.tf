# The AWS platform under kloakware: a VPC, an EKS cluster with a managed node
# group, Aurora PostgreSQL, the secrets, a DNS zone, a certificate, and the
# two controllers that turn an Ingress into a load balancer and a DNS record.
# Sized by tier; the outputs are the contract the kloakware module is built
# on, the same as the Azure platform's.

locals {
  tiers = {
    basic = {
      zones               = 1
      nat_per_zone        = false
      node_type           = "t3.large"
      node_min            = 1
      node_desired        = 1
      node_max            = 1
      database_serverless = true
      database_min_acu    = 0.5
      database_max_acu    = 2
      database_class      = "db.serverless"
      database_instances  = 1
      backup_days         = 1
      protect             = false
    }
    production = {
      zones               = 3
      nat_per_zone        = true
      node_type           = "m6i.large"
      node_min            = 3
      node_desired        = 3
      node_max            = 6
      database_serverless = false
      database_min_acu    = null
      database_max_acu    = null
      database_class      = "db.r6g.large"
      database_instances  = 2
      backup_days         = 14
      protect             = true
    }
  }
  tier = local.tiers[var.tier]

  azs  = slice(data.aws_availability_zones.available.names, 0, local.tier.zones)
  cidr = "10.40.0.0/16"
  tags = merge(var.tags, { "kloakware/platform" = var.name, "kloakware/tier" = var.tier })
}

data "aws_availability_zones" "available" {
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# --- Network -----------------------------------------------------------------

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = var.name
  cidr = local.cidr
  azs  = local.azs

  private_subnets  = [for i, az in local.azs : cidrsubnet(local.cidr, 4, i)]
  public_subnets   = [for i, az in local.azs : cidrsubnet(local.cidr, 4, i + 8)]
  database_subnets = [for i, az in local.azs : cidrsubnet(local.cidr, 4, i + 12)]

  enable_nat_gateway     = true
  single_nat_gateway     = !local.tier.nat_per_zone
  one_nat_gateway_per_az = local.tier.nat_per_zone
  enable_dns_hostnames   = true
  enable_dns_support     = true

  create_database_subnet_group = true

  public_subnet_tags  = { "kubernetes.io/role/elb" = "1" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1" }

  tags = local.tags
}

# --- Kubernetes --------------------------------------------------------------

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.29"

  name               = var.name
  kubernetes_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # The API server reachable from the runner that applies this; narrowed to
  # the organisation's addresses once there is a fixed egress to name.
  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  addons = {
    coredns                = {}
    kube-proxy             = {}
    vpc-cni                = { before_compute = true }
    eks-pod-identity-agent = { before_compute = true }
  }

  eks_managed_node_groups = {
    default = {
      instance_types = [local.tier.node_type]
      min_size       = local.tier.node_min
      desired_size   = local.tier.node_desired
      max_size       = local.tier.node_max
      ami_type       = "AL2023_x86_64_STANDARD"
    }
  }

  enabled_log_types = ["api", "audit", "authenticator"]

  tags = local.tags
}

# --- Database ----------------------------------------------------------------

module "database" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 10.4"

  name           = var.name
  engine         = "aurora-postgresql"
  engine_mode    = "provisioned"
  engine_version = "17.6"
  database_name  = "kloakware"

  master_username             = "kloakware"
  manage_master_user_password = true

  instances = {
    for i in range(local.tier.database_instances) : tostring(i + 1) => { instance_class = local.tier.database_class }
  }

  serverlessv2_scaling_configuration = local.tier.database_serverless ? {
    min_capacity = local.tier.database_min_acu
    max_capacity = local.tier.database_max_acu
  } : null

  vpc_id               = module.vpc.vpc_id
  db_subnet_group_name = module.vpc.database_subnet_group_name
  security_group_ingress_rules = {
    cluster = {
      description = "PostgreSQL from the VPC: the nodes"
      cidr_ipv4   = local.cidr
      from_port   = 5432
      to_port     = 5432
    }
  }

  storage_encrypted                    = true
  backup_retention_period              = local.tier.backup_days
  deletion_protection                  = local.tier.protect
  skip_final_snapshot                  = !local.tier.protect
  cluster_performance_insights_enabled = local.tier.protect
  apply_immediately                    = !local.tier.protect

  tags = local.tags
}

# The managed master password, read back for the kubernetes Secret the
# server starts from. It never leaves the state and the cluster.
data "aws_secretsmanager_secret_version" "database" {
  secret_id = module.database.cluster_master_user_secret[0].secret_arn
}

# --- Secrets -----------------------------------------------------------------

resource "random_password" "admin" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "admin" {
  name                    = "${var.name}/bootstrap-admin"
  description             = "The temporary administrator kloakware creates on the first start of an empty database"
  recovery_window_in_days = local.tier.protect ? 30 : 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "admin" {
  secret_id     = aws_secretsmanager_secret.admin.id
  secret_string = jsonencode({ username = "admin", password = random_password.admin.result })
}

# --- DNS and the certificate -------------------------------------------------

resource "aws_route53_zone" "this" {
  name    = var.dns_zone
  comment = "kloakware ${var.name}: delegated from the parent zone by hand once"
  tags    = local.tags
}

resource "aws_acm_certificate" "this" {
  domain_name       = var.hostname
  validation_method = "DNS"
  tags              = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = {
    for option in aws_acm_certificate.this.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id         = aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}

# --- Identity for the controllers the add-ons module installs ----------------
# An Ingress becomes a load balancer and a DNS record through two charts;
# their pods assume these roles through EKS Pod Identity. The charts
# themselves are in modules/addons-aws, applied with the cluster's own
# providers, which a module cannot configure from a cluster it creates.

data "aws_iam_policy_document" "pod_identity_trust" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "load_balancer_controller" {
  name               = "${var.name}-load-balancer-controller"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
  tags               = local.tags
}

# The controller's own policy, at its release, vendored: what it may do to
# load balancers, target groups, listeners and security groups.
resource "aws_iam_policy" "load_balancer_controller" {
  name   = "${var.name}-load-balancer-controller"
  policy = file("${path.module}/iam/aws-load-balancer-controller-v3.6.0.json")
  tags   = local.tags
}

resource "aws_iam_role_policy_attachment" "load_balancer_controller" {
  role       = aws_iam_role.load_balancer_controller.name
  policy_arn = aws_iam_policy.load_balancer_controller.arn
}

resource "aws_eks_pod_identity_association" "load_balancer_controller" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.load_balancer_controller.arn
}

data "aws_iam_policy_document" "external_dns" {
  statement {
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [aws_route53_zone.this.arn]
  }
  statement {
    actions   = ["route53:ListHostedZones", "route53:ListResourceRecordSets", "route53:ListTagsForResource"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "external_dns" {
  name               = "${var.name}-external-dns"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "external_dns" {
  name   = "route53"
  role   = aws_iam_role.external_dns.id
  policy = data.aws_iam_policy_document.external_dns.json
}

resource "aws_eks_pod_identity_association" "external_dns" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "external-dns"
  role_arn        = aws_iam_role.external_dns.arn
}
