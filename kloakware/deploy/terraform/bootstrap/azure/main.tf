# Applied once, by hand, with the owner's credentials: the identity CI uses
# on Azure. One application with a federated credential per GitHub
# environment and one for pull requests; Contributor and User Access
# Administrator on the subscription, since the platform assigns roles. The
# state stays in the AWS bootstrap's bucket; an environment that moves to
# Azure keeps its state where it is.

terraform {
  required_version = ">= 1.10"
  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
  }
}

variable "repository" {
  type    = string
  default = "decionis/steward"
}

variable "environments" {
  type    = list(string)
  default = ["kloakware-dev", "kloakware-qa", "kloakware-staging", "kloakware-prod"]
}

provider "azurerm" {
  features {}
}

provider "azuread" {}

data "azurerm_subscription" "current" {}

resource "azuread_application" "terraform" {
  display_name = "kloakware-terraform"
}

resource "azuread_service_principal" "terraform" {
  client_id = azuread_application.terraform.client_id
}

resource "azuread_application_federated_identity_credential" "environment" {
  for_each = toset(var.environments)

  application_id = azuread_application.terraform.id
  display_name   = each.key
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.repository}:environment:${each.key}"
}

resource "azuread_application_federated_identity_credential" "pull_request" {
  application_id = azuread_application.terraform.id
  display_name   = "pull-request"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.repository}:pull_request"
}

resource "azurerm_role_assignment" "contributor" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.terraform.object_id
}

resource "azurerm_role_assignment" "access_administrator" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "User Access Administrator"
  principal_id         = azuread_service_principal.terraform.object_id
}

output "client_id" {
  description = "KLOAKWARE_AZURE_CLIENT_ID."
  value       = azuread_application.terraform.client_id
}

output "tenant_id" {
  description = "KLOAKWARE_AZURE_TENANT_ID."
  value       = data.azurerm_subscription.current.tenant_id
}

output "subscription_id" {
  description = "KLOAKWARE_AZURE_SUBSCRIPTION_ID."
  value       = data.azurerm_subscription.current.subscription_id
}
