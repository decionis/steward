terraform {
  required_version = ">= 1.5"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.0"
    }
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.1"
    }
  }
}
