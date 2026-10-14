#!/usr/bin/env bash
#
# Applies the steward realm to one environment, the way the promotion
# workflow does for dev, QA, staging and production in turn. The environment
# supplies where and as whom:
#
#   KLOAKWARE_URL                    where kloakware answers (empty: not deployed yet, skip)
#   STEWARD_URL                      where Steward runs there
#   KLOAKWARE_CI_CLIENT_SECRET       the kloakware-ci service account's secret (K11): config-cli
#                                    signs in with client credentials against the master realm,
#                                    with the two realms' management roles and nothing of master's
#   KEYCLOAK_USER, KEYCLOAK_PASSWORD the bootstrap administrator instead, for the first run only:
#                                    it creates the service account from master.json, and the
#                                    password goes back to the vault
#   KLOAKWARE_STEWARD_CLIENT_SECRET  the steward client's secret there
#   KLOAKWARE_STEWARD_API_SECRET     the steward-api resource server's secret there
#   KLOAKWARE_LEGACY_CLIENT_SECRET   the legacy dashboard's secret, the application behind the
#                                    SiteMinder agent now an OIDC client (K13)
#   LEGACY_URL                       where that application answers, for its redirect URI
#   KLOAKWARE_SMTP_HOST, _PORT, _FROM the mail server the realm sends through (K14); the laptop's sink by default
#   KLOAKWARE_FAPI_CLIENT_CERTIFICATE
#                                    the financial-grade client's certificate from that
#                                    environment's PKI, DER as base64 on one line (K11)
#   STEWARD_FAPI_URL                 Steward's https origin for the financial-grade clients' URIs
#   KLOAKWARE_BANKID_URL             where the BankID Relying Party API answers for that environment
#   KLOAKWARE_PUBLIC_URL             kloakware as the browser reaches it (the brokers' redirect base)
#   KLOAKWARE_INTERNAL_URL           kloakware as it reaches itself (the brokers' token and metadata base)
#   KLOAKWARE_BROKER_CLIENT_SECRET   the steward-broker client's secret in the corp realm
#   KLOAKWARE_LDAP_URL               the directory the ldap federation reads
#   KLOAKWARE_LDAP_BIND_PASSWORD     the bind credential for it
#   STEWARD_DB_JDBC_URL, STEWARD_DB_USER, STEWARD_DB_PASSWORD
#                                    the read-only user on Steward's database the steward-users storage reads
#
# The realm file is the one committed at the tag being promoted; nothing is
# read from the running realm, and an unchanged file still converges it.
set -euo pipefail

if [ -z "${KLOAKWARE_URL:-}" ]; then
  echo "::notice::KLOAKWARE_URL is not set for this environment: no kloakware deployed there yet, nothing to apply"
  exit 0
fi

here=$(cd "$(dirname "$0")" && pwd)
realms=$(cd "$here/../realms" && pwd)

# The same image, by digest, as deploy/compose/compose.yaml.
image="docker.io/adorsys/keycloak-config-cli:6.5.1-26.5.5@sha256:0955d98c8a341898b7aa177477edf8a1e90569ae50bbe7598141c1270b773274"

# As whom: the service account when its secret is given, else the
# administrator. The master realm's file, which creates the account, needs
# the administrator; the account cannot manage the realm it lives in.
login=()
if [ -n "${KLOAKWARE_CI_CLIENT_SECRET:-}" ]; then
  login=(-e KEYCLOAK_GRANT_TYPE=client_credentials -e KEYCLOAK_CLIENT_ID=kloakware-ci
    -e KEYCLOAK_CLIENT_SECRET="$KLOAKWARE_CI_CLIENT_SECRET" -e KEYCLOAK_LOGIN_REALM=master)
else
  login=(-e KEYCLOAK_USER -e KEYCLOAK_PASSWORD)
fi

# host.docker.internal reaches the machine this runs on, for a rehearsal
# against a laptop or CI stack; a deployment's KLOAKWARE_URL is a real name.
apply() {
  docker run --rm \
    --add-host host.docker.internal:host-gateway \
    -v "$realms/corp.json:/config/corp.json:ro" \
    -v "$realms/steward.json:/config/steward.json:ro" \
    -v "$realms/master.json:/config/master.json:ro" \
    -e KEYCLOAK_URL="$KLOAKWARE_URL" \
    "${login[@]}" \
    -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true \
    -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
    -e IMPORT_FILES_LOCATIONS="$1" \
    -e IMPORT_MANAGED_CLIENT="$2" \
    -e IMPORT_VARSUBSTITUTION_ENABLED=true \
    -e IMPORT_CACHE_ENABLED=false \
    -e STEWARD_URL \
    -e STEWARD_FAPI_URL="${STEWARD_FAPI_URL:-https://steward.example}" \
    -e KLOAKWARE_STEWARD_CLIENT_SECRET \
    -e KLOAKWARE_STEWARD_API_SECRET \
    -e KLOAKWARE_FAPI_CLIENT_CERTIFICATE \
    -e KLOAKWARE_LEGACY_CLIENT_SECRET \
    -e LEGACY_URL="${LEGACY_URL:-http://localhost:8082}" \
    -e KLOAKWARE_SMTP_HOST="${KLOAKWARE_SMTP_HOST:-mail}" \
    -e KLOAKWARE_SMTP_PORT="${KLOAKWARE_SMTP_PORT:-1025}" \
    -e KLOAKWARE_SMTP_FROM="${KLOAKWARE_SMTP_FROM:-no-reply@steward.example}" \
    -e KLOAKWARE_CI_CLIENT_SECRET \
    -e KLOAKWARE_BANKID_URL="${KLOAKWARE_BANKID_URL:-http://bankid:8090}" \
    -e KLOAKWARE_PUBLIC_URL="${KLOAKWARE_PUBLIC_URL:-$KLOAKWARE_URL}" \
    -e KLOAKWARE_INTERNAL_URL="${KLOAKWARE_INTERNAL_URL:-$KLOAKWARE_URL}" \
    -e KLOAKWARE_BROKER_CLIENT_SECRET \
    -e KLOAKWARE_LDAP_URL="${KLOAKWARE_LDAP_URL:-ldap://ldap:389}" \
    -e KLOAKWARE_LDAP_BIND_PASSWORD \
    -e STEWARD_DB_JDBC_URL="${STEWARD_DB_JDBC_URL:-jdbc:postgresql://db:5432/steward}" \
    -e STEWARD_DB_USER="${STEWARD_DB_USER:-steward}" \
    -e STEWARD_DB_PASSWORD \
    "$image"
}

# The realms, fully managed: what the files no longer name is removed.
apply /config/corp.json,/config/steward.json full

# The master realm's one addition, the service account, as the administrator
# only, and without touching what else master holds.
if [ -n "${KEYCLOAK_PASSWORD:-}" ]; then
  login=(-e KEYCLOAK_USER -e KEYCLOAK_PASSWORD)
  apply /config/master.json no-delete
else
  echo "::notice::applied as the kloakware-ci service account; master.json is the administrator's and was not applied"
fi
