#!/usr/bin/env bash
#
# The drift check, run by CI (kloakware.yml, job "drift") and by hand:
#
#   kloakware/config/drift/CheckDrift.sh
#
# Against a stack started from the compose file, it proves three things in
# order: a clean apply of the market realms shows no drift (plan exits 0), a
# change made by hand through the admin API is detected (plan exits 2), and
# the next apply puts it back (plan exits 0 again). The shared steward realm's
# convergence under keycloak-config-cli is proven by RealmConvergenceTest in
# the smoke module; this script is the Terraform half.
#
# Needs Docker, Terraform 1.5 or later, curl and python3.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
compose_dir="$root/deploy/compose"
compose="docker compose --env-file $compose_dir/.env.example -f $compose_dir/compose.yaml"
tfvars="environments/local.tfvars"

cleanup() {
  $compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The dev-only values the compose file runs with; they are for a laptop and CI.
set -a
# shellcheck disable=SC1091
. "$compose_dir/.env.example"
set +a

echo "== the stack"
$compose up --build --wait --wait-timeout 300
# --wait returns once the long-running services are healthy; the overlay is a
# one-shot service that may still be running. Terraform signs in to the master
# realm over plain HTTP, which only the overlay allows, so wait for its exit.
overlay=$($compose ps -aq config-dev)
[ "$(docker wait "$overlay")" = 0 ] || { echo "FAIL: the dev overlay did not apply"; $compose logs config-dev; exit 1; }

export KEYCLOAK_USER=admin
export KEYCLOAK_PASSWORD="$KLOAKWARE_BOOTSTRAP_ADMIN_PASSWORD"
export TF_VAR_steward_client_secret="$KLOAKWARE_STEWARD_CLIENT_SECRET"

cd "$root/config/terraform"
# A previous run's state describes realms that no longer exist.
rm -f terraform.tfstate terraform.tfstate.backup

plan_exit() {
  set +e
  terraform plan -input=false -detailed-exitcode -no-color -var-file="$tfvars" >/dev/null
  local code=$?
  set -e
  echo "$code"
}

echo "== apply the market realms"
terraform init -input=false -no-color >/dev/null
terraform apply -input=false -auto-approve -no-color -var-file="$tfvars" | tail -3

echo "== no drift after apply"
[ "$(plan_exit)" = 0 ] || { echo "FAIL: plan reports drift right after apply"; exit 1; }

echo "== a change by hand: the SE realm's access token lifespan"
token=$(curl -sf \
  -d grant_type=password -d client_id=admin-cli -d username=admin \
  --data-urlencode "password=$KLOAKWARE_BOOTSTRAP_ADMIN_PASSWORD" \
  "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -sf -X PUT \
  -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
  -d '{"accessTokenLifespan":600}' \
  "http://localhost:8080/admin/realms/steward-se"

echo "== detected"
[ "$(plan_exit)" = 2 ] || { echo "FAIL: plan did not report the hand-made change"; exit 1; }

echo "== put back"
terraform apply -input=false -auto-approve -no-color -var-file="$tfvars" >/dev/null
[ "$(plan_exit)" = 0 ] || { echo "FAIL: the realm did not converge"; exit 1; }

echo "drift check OK: clean after apply, a hand-made change detected, converged on the next apply"
