# The Azure platform under kloakware: a resource group, a VNet, an AKS cluster
# with the application routing add-on (a managed ingress-nginx that writes
# its own DNS records), Azure Database for PostgreSQL Flexible Server on a
# private subnet, a Key Vault for the secrets, a DNS zone, and cert-manager
# issuing the hostname's certificate from Let's Encrypt. Sized by tier; the
# outputs are the same contract as the AWS platform's.

locals {
  tiers = {
    basic = {
      zones        = []
      sku_tier     = "Free"
      node_size    = "Standard_D2s_v5"
      node_min     = 1
      node_max     = 1
      autoscale    = false
      database_sku = "B_Standard_B1ms"
      database_ha  = false
      backup_days  = 7
      protect      = false
    }
    production = {
      zones        = ["1", "2", "3"]
      sku_tier     = "Standard"
      node_size    = "Standard_D4s_v5"
      node_min     = 3
      node_max     = 6
      autoscale    = true
      database_sku = "GP_Standard_D2ds_v5"
      database_ha  = true
      backup_days  = 14
      protect      = true
    }
  }
  tier = local.tiers[var.tier]
  tags = merge(var.tags, { "kloakware/platform" = var.name, "kloakware/tier" = var.tier })
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "this" {
  name     = var.name
  location = var.location
  tags     = local.tags
}

# --- Network -----------------------------------------------------------------

resource "azurerm_virtual_network" "this" {
  name                = var.name
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  address_space       = ["10.41.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "nodes" {
  name                 = "nodes"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = ["10.41.0.0/20"]
}

resource "azurerm_subnet" "database" {
  name                 = "database"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = ["10.41.16.0/24"]
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "postgresql"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_private_dns_zone" "database" {
  name                = "${var.name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "database" {
  name                  = var.name
  resource_group_name   = azurerm_resource_group.this.name
  private_dns_zone_name = azurerm_private_dns_zone.database.name
  virtual_network_id    = azurerm_virtual_network.this.id
}

# --- Database ----------------------------------------------------------------

resource "random_password" "database" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                          = var.name
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  version                       = "17"
  delegated_subnet_id           = azurerm_subnet.database.id
  private_dns_zone_id           = azurerm_private_dns_zone.database.id
  public_network_access_enabled = false

  administrator_login    = "kloakware"
  administrator_password = random_password.database.result

  sku_name                     = local.tier.database_sku
  storage_mb                   = 32768
  backup_retention_days        = local.tier.backup_days
  geo_redundant_backup_enabled = local.tier.protect
  zone                         = local.tier.database_ha ? "1" : null

  dynamic "high_availability" {
    for_each = local.tier.database_ha ? [1] : []
    content {
      mode                      = "ZoneRedundant"
      standby_availability_zone = "2"
    }
  }

  tags = local.tags

  depends_on = [azurerm_private_dns_zone_virtual_network_link.database]
}

resource "azurerm_postgresql_flexible_server_database" "kloakware" {
  name      = "kloakware"
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# --- DNS ---------------------------------------------------------------------

resource "azurerm_dns_zone" "this" {
  name                = var.dns_zone
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

# --- Kubernetes --------------------------------------------------------------

resource "azurerm_kubernetes_cluster" "this" {
  name                = var.name
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  dns_prefix          = var.name
  kubernetes_version  = var.kubernetes_version
  sku_tier            = local.tier.sku_tier

  default_node_pool {
    name                 = "default"
    vm_size              = local.tier.node_size
    vnet_subnet_id       = azurerm_subnet.nodes.id
    zones                = local.tier.zones
    auto_scaling_enabled = local.tier.autoscale
    node_count           = local.tier.autoscale ? null : local.tier.node_min
    min_count            = local.tier.autoscale ? local.tier.node_min : null
    max_count            = local.tier.autoscale ? local.tier.node_max : null
    upgrade_settings {
      max_surge = "33%"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_policy      = "cilium"
    network_data_plane  = "cilium"
  }

  oidc_issuer_enabled               = true
  workload_identity_enabled         = true
  role_based_access_control_enabled = true

  # The managed ingress-nginx, writing the records for its Ingresses into the
  # zone above: the Azure twin of the load balancer controller and
  # external-dns on EKS.
  web_app_routing {
    dns_zone_ids = [azurerm_dns_zone.this.id]
  }

  tags = local.tags
}

resource "azurerm_role_assignment" "routing_dns" {
  scope                = azurerm_dns_zone.this.id
  role_definition_name = "DNS Zone Contributor"
  principal_id         = azurerm_kubernetes_cluster.this.web_app_routing[0].web_app_routing_identity[0].object_id
}

# --- Secrets -----------------------------------------------------------------

resource "random_password" "admin" {
  length  = 32
  special = false
}

resource "azurerm_key_vault" "this" {
  name                       = substr(replace("${var.name}-kv", "_", "-"), 0, 24)
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = local.tier.protect
  soft_delete_retention_days = 7
  tags                       = local.tags
}

# Whoever applies this writes the secrets: the Terraform identity.
resource "azurerm_role_assignment" "secrets_officer" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_key_vault_secret" "database" {
  name         = "database-password"
  value        = random_password.database.result
  key_vault_id = azurerm_key_vault.this.id
  depends_on   = [azurerm_role_assignment.secrets_officer]
}

resource "azurerm_key_vault_secret" "admin" {
  name         = "bootstrap-admin-password"
  value        = random_password.admin.result
  key_vault_id = azurerm_key_vault.this.id
  depends_on   = [azurerm_role_assignment.secrets_officer]
}
