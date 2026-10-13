#!/usr/bin/env bash
#
# Runs the sign-in end to end: Steward in live mode, built and started here
# against a kloakware already running from kloakware/deploy/compose with the
# dev overlay applied. Locally:
#
#   (cd kloakware/deploy/compose && STEWARD_URL=http://host.docker.internal:3000 \
#     docker compose --env-file .env.example up --build --wait)
#   pnpm build && STEWARD_URL=http://host.docker.internal:3000 test/e2e/RunKloakwareSignIn.sh
#
# STEWARD_URL is what the realm redirects to and what the kloakware container
# posts the backchannel logout to; this script reaches Steward on localhost.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
run="$root/test/e2e/.run"
mkdir -p "$run"

# STEWARD_URL from the caller wins over the compose file's default, which is
# read next: the realm was rendered with the caller's value.
public_url="${STEWARD_URL:-http://localhost:3000}"
kloakware_url="${KLOAKWARE_URL:-http://localhost:8080}"

set -a
# shellcheck disable=SC1091
. "$root/kloakware/deploy/compose/.env.example"
set +a

export STEWARD_DATA_MODE=live
export DECIONIS_API_BASE_URL=https://api.decionis.invalid
export DECIONIS_API_KEY=end-to-end-not-used
export DECIONIS_ORG_ID=0f6b2a5e-7c1d-4e3f-9a8b-2c1d0e9f8a7b
export DECIONIS_WORKSPACE_NAME="End to end"
export STEWARD_OIDC_ISSUER_URL="$kloakware_url/realms/steward"
export STEWARD_OIDC_CLIENT_ID=steward
export STEWARD_OIDC_CLIENT_SECRET="$KLOAKWARE_STEWARD_CLIENT_SECRET"
export STEWARD_PUBLIC_URL="$public_url"
export STEWARD_DATA_DIR="$run/data"
# The audit listener posts each record to Steward, signed with this (K5).
export STEWARD_AUDIT_WEBHOOK_SECRET="$KLOAKWARE_AUDIT_WEBHOOK_SECRET"
export PORT=3000
rm -rf "$run/data"

echo "== Steward, live, signing in through $STEWARD_OIDC_ISSUER_URL"
# Nothing may already hold the port: a previous run's server, for instance.
# Only the listener: a plain port match also catches the Docker backend
# proxying the audit listener's connection to Steward, and kills the engine.
lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
(cd "$root" && exec pnpm start > "$run/steward.log" 2>&1) &
steward=$!
cleanup() {
  kill "$steward" 2>/dev/null || true
  # pnpm hands off to next-server; end whatever still listens on the port.
  lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf http://localhost:3000/api/health >/dev/null || { echo "Steward did not start:"; tail -40 "$run/steward.log"; exit 1; }

echo "== the sign-in, end to end"
STEWARD_URL=http://localhost:3000 STEWARD_PUBLIC_URL="$public_url" KLOAKWARE_URL="$kloakware_url" \
  STEWARD_E2E_DATABASE="$run/data/steward.sqlite" \
  node --test "$root/test/e2e/KloakwareSignIn.test.mjs" || { echo "--- steward.log ---"; tail -60 "$run/steward.log"; exit 1; }
