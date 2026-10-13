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
  -v "$realms/steward.json:/config/steward.json:ro" \
  -e KEYCLOAK_URL="$KLOAKWARE_URL" \
  -e KEYCLOAK_USER \
  -e KEYCLOAK_PASSWORD \
  -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true \
  -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
  -e IMPORT_FILES_LOCATIONS=/config/steward.json \
  -e IMPORT_VARSUBSTITUTION_ENABLED=true \
  -e IMPORT_CACHE_ENABLED=false \
  -e STEWARD_URL \
  -e KLOAKWARE_STEWARD_CLIENT_SECRET \
  "$image"
