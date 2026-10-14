#!/usr/bin/env bash
#
# Finds the first bottleneck on purpose (K10): runs FindTheKnee.js against
# the laptop stack, sign-ins arriving at a rate that climbs in stages, and
# reads Prometheus at the end of each stage: the token endpoint's p95, the
# pool's average wait and the number waiting, CPU, and the rate achieved.
# The knee is the first stage where a number leaves the floor.
#
#   observability/FindTheKnee.sh                     the default stages
#   STAGES=5:60s,10:60s,20:60s observability/FindTheKnee.sh
#
# STEWARD_URL must be the value the stack was started with, since the realm
# knows only that redirect URI; the compose file's convention is
# http://host.docker.internal:3000, which is the default here.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
compose="$root/deploy/compose"
run="$here/.run"
rm -rf "$run"; mkdir -p "$run"

K6_IMAGE="docker.io/grafana/k6:2.3.0@sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34"
STAGES=${STAGES:-2:60s,5:60s,10:60s,20:60s,40:60s}
PROMETHEUS=${PROMETHEUS:-http://localhost:9090}

# Read before the env file, which sets its own STEWARD_URL for a laptop.
steward_url="${STEWARD_URL:-http://host.docker.internal:3000}"

set -a
# shellcheck disable=SC1091
. "$compose/.env.example"
set +a

query() { curl -s "$PROMETHEUS/api/v1/query" --data-urlencode "query=$1" | python3 -I -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; print(round(float(r[0]["value"][1]), 3) if r else "n/a")'; }

sample() {
  printf '%-10s %-12s %-12s %-10s %-10s %-10s\n' "$1" \
    "$(query 'sum(rate(keycloak_user_events_total{event="login",error=""}[30s]))')" \
    "$(query 'histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{uri="/realms/{realm}/protocol/{protocol}/token"}[30s])))')" \
    "$(query 'max(agroal_blocking_time_average_milliseconds)')" \
    "$(query 'max(agroal_awaiting_count)')" \
    "$(query 'max(process_cpu_usage)')"
}

# The edge rate limits (K11) are per source, and this load is one source
# pretending to be many: the proxy is brought up with them lifted, and put
# back as the compose file has it when the run ends.
(cd "$compose" && KLOAKWARE_EDGE_TOKEN_RATE=1000000 KLOAKWARE_EDGE_LOGIN_RATE=1000000 docker compose --env-file .env.example up -d --no-deps --wait kloakware >/dev/null)
restore_proxy() { (cd "$compose" && docker compose --env-file .env.example up -d --no-deps --wait kloakware >/dev/null); }
trap restore_proxy EXIT

printf '%-10s %-12s %-12s %-10s %-10s %-10s\n' stage logins/s token-p95 pool-wait waiting cpu > "$run/knee.txt"
docker run -d --name kloakware-knee --add-host host.docker.internal:host-gateway \
  -v "$here/FindTheKnee.js:/scripts/FindTheKnee.js:ro" -v "$run:/out" \
  -e BASE=http://host.docker.internal:8080 -e STEWARD_URL="$steward_url" \
  -e USERNAME=erin.example -e PASSWORD="$KLOAKWARE_DEV_USER_PASSWORD" \
  -e CLIENT_SECRET="$KLOAKWARE_STEWARD_CLIENT_SECRET" -e STAGES="$STAGES" \
  "$K6_IMAGE" run --quiet --summary-export=/out/k6-summary.json /scripts/FindTheKnee.js >/dev/null

IFS=',' read -ra list <<< "$STAGES"
for stage in "${list[@]}"; do
  seconds=${stage#*:}; seconds=${seconds%s}
  sleep "$seconds"
  sample "$stage" >> "$run/knee.txt"
done
docker wait kloakware-knee >/dev/null 2>&1 || true
docker logs kloakware-knee > "$run/k6.log" 2>&1 || true
docker rm -f kloakware-knee >/dev/null 2>&1 || true

cat "$run/knee.txt"
python3 -I -c 'import json,sys; m=json.load(open(sys.argv[1]))["metrics"]; print("requests:", int(m["http_reqs"]["count"]), "failed:", int(m["http_req_failed"]["passes"]), "max VUs:", int(m["vus_max"]["value"]))' "$run/k6-summary.json" 2>/dev/null || true
