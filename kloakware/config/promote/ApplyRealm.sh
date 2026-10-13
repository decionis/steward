#!/usr/bin/env bash
#
# Applies the steward realm to one environment, the way the promotion
# workflow does for dev, QA, staging and production in turn. The environment
# supplies where and as whom:
#
#   KLOAKWARE_URL                    where kloakware answers (empty: not deployed yet, skip)
#   STEWARD_URL                      where Steward runs there
#   KEYCLOAK_USER, KEYCLOAK_PASSWORD the administrator config-cli signs in as
#   KLOAKWARE_STEWARD_CLIENT_SECRET  the steward client's secret there
#   KLOAKWARE_STEWARD_API_SECRET     the steward-api resource server's secret there
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

docker run --rm \
  -v "$realms/corp.json:/config/corp.json:ro" \
  -v "$realms/steward.json:/config/steward.json:ro" \
  -e KEYCLOAK_URL="$KLOAKWARE_URL" \
  -e KEYCLOAK_USER \
  -e KEYCLOAK_PASSWORD \
  -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true \
  -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
  -e IMPORT_FILES_LOCATIONS=/config/corp.json,/config/steward.json \
  -e IMPORT_VARSUBSTITUTION_ENABLED=true \
  -e IMPORT_CACHE_ENABLED=false \
  -e STEWARD_URL \
  -e KLOAKWARE_STEWARD_CLIENT_SECRET \
  -e KLOAKWARE_STEWARD_API_SECRET \
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
