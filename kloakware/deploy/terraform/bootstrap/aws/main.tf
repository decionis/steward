# Applied once, by hand, with the owner's credentials: what CI needs before
# it can apply anything. GitHub's OIDC provider in the account, one role per
# environment that only that environment's workflow can assume, a read-only
# role for pull-request plans, and the bucket the states live in.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  type    = string
  default = "eu-north-1"
}

variable "repository" {
  description = "The GitHub repository whose workflows assume the roles, owner/name."
  type        = string
  default     = "decionis/steward"
}

variable "environments" {
  description = "The GitHub environments that apply, each with its own role."
  type        = list(string)
  default     = ["kloakware-dev", "kloakware-qa", "kloakware-staging", "kloakware-prod"]
}

variable "state_bucket" {
  description = "The bucket name for the states; globally unique."
  type        = string
}

provider "aws" {
  region = var.region
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # GitHub's root certificates' thumbprints; AWS verifies against its own
  # trust store since 2023 and keeps these for compatibility.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# A role per environment: only a job running in that GitHub environment of
# this repository gets its token accepted.
data "aws_iam_policy_document" "apply_trust" {
  for_each = toset(var.environments)

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repository}:environment:${each.key}"]
    }
  }
}

resource "aws_iam_role" "apply" {
  for_each = toset(var.environments)

  name               = "${each.key}-terraform-apply"
  assume_role_policy = data.aws_iam_policy_document.apply_trust[each.key].json
}

# Creating a VPC, a cluster and a database is most of the account; a
# permissions boundary narrows this once the resource set is known.
resource "aws_iam_role_policy_attachment" "apply" {
  for_each = toset(var.environments)

  role       = aws_iam_role.apply[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Pull requests plan: read everything, write nothing but the state lock.
data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repository}:pull_request"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "kloakware-terraform-plan"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan_state" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "state"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_state.json
}

output "apply_role_arns" {
  description = "KLOAKWARE_TERRAFORM_ROLE_ARN, one per GitHub environment."
  value       = { for env, role in aws_iam_role.apply : env => role.arn }
}

output "plan_role_arn" {
  description = "KLOAKWARE_TERRAFORM_PLAN_ROLE_ARN, a repository variable."
  value       = aws_iam_role.plan.arn
}

output "state_bucket" {
  description = "KLOAKWARE_TERRAFORM_STATE_BUCKET, a repository variable."
  value       = aws_s3_bucket.state.bucket
}
