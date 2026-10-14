#!/usr/bin/env bash
#
# The upgrade runbook, rehearsed: from one Keycloak to another on the laptop
# stack (two nodes behind HAProxy), the way production would move.
#
#   upgrade/Rehearse.sh <from> <to>     two Keycloak base images, by digest
#
# A patch (same major.minor) is rolled one node at a time under a k6 login
# load, each node drained in the proxy before it restarts, and the rehearsal
# fails on one failed request. A minor is recreated: a snapshot of the
# database, both nodes stopped, the first new node migrating the schema
# under Liquibase's lock, the second joining. Both paths end with the
# manual strategy handing the migration SQL to a file rather than running
# it, and with the rollback: the snapshot restored and the old image back.
set -euo pipefail

from=${1:?from image}
to=${2:?to image}
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
compose="$root/deploy/compose"
run="$here/.run"
rm -rf "$run"; mkdir -p "$run"

K6_IMAGE="docker.io/grafana/k6:2.3.0@sha256:9c2dee7f8ed74d317e4027c06a10f169b625638189de8d4555d0b3486a5aeb34"
LOAD_SECONDS=${LOAD_SECONDS:-150}

log() { printf '\n== %s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { printf '\n!! %s\n' "$*" >&2; exit 1; }

# 26.8.0 from quay.io/keycloak/keycloak:26.8.0@sha256:...
version() { printf '%s' "$1" | sed -E 's/.*:([0-9]+\.[0-9]+\.[0-9]+)(@.*)?$/\1/'; }
minor() { printf '%s' "$1" | cut -d. -f1-2; }

set -a
# shellcheck disable=SC1091
. "$compose/.env.example"
set +a

# The edge rate limits (K11) are per source, and the load here is one
# source pretending to be many: lifted for the rehearsal's proxy.
dc() { (cd "$compose" && STEWARD_URL=http://host.docker.internal:3000 KLOAKWARE_EDGE_TOKEN_RATE=1000000 KLOAKWARE_EDGE_LOGIN_RATE=1000000 docker compose --env-file .env.example "$@"); }

build() {
  log "Building $1 on $2"
  docker build -q --build-arg "KEYCLOAK_IMAGE=$2" -t "$1" "$root" >/dev/null
}

healthy() { curl -sf "http://localhost:$1/health/ready" >/dev/null; }

wait_node() {
  for _ in $(seq 1 90); do healthy "$1" && return 0; sleep 2; done
  fail "node on management port $1 did not become ready"
}

cluster_size() { curl -s http://localhost:9001/metrics | grep '^vendor_cluster_size' | awk '{print $2}' | cut -d. -f1; }

wait_cluster() {
  for _ in $(seq 1 60); do [ "$(cluster_size)" = "$1" ] && return 0; sleep 2; done
  fail "the cluster did not reach $1 nodes (saw $(cluster_size))"
}

schema_version() { dc exec -T db psql -U kloakware -d "${1:-kloakware}" -Atc "SELECT version FROM migration_model ORDER BY update_time DESC LIMIT 1"; }

proxy() { dc exec -T kloakware sh -c "printf '%s\n' \"$1\" | socat stdio /var/lib/haproxy/admin.sock" >/dev/null; }

# The node as the proxy sees it: current sessions (scur) and status (UP, DOWN, MAINT, DRAIN).
sessions() { dc exec -T kloakware sh -c "printf 'show stat\n' | socat stdio /var/lib/haproxy/admin.sock" | awk -F, -v s="$1" '$1 == "nodes" && $2 == s { print $5 }'; }
proxy_status() { dc exec -T kloakware sh -c "printf 'show stat\n' | socat stdio /var/lib/haproxy/admin.sock" | awk -F, -v s="$1" '$1 == "nodes" && $2 == s { print $18 }'; }

# A restarted node is a new container at a new address, which the proxy
# learns through DNS and then checks; nothing moves on until it says UP.
wait_proxy_up() {
  for _ in $(seq 1 60); do [ "$(proxy_status "$1")" = "UP" ] && return 0; sleep 1; done
  fail "the proxy never saw $1 up again (status: $(proxy_status "$1"))"
}

signs_in() {
  curl -sf -X POST http://localhost:8080/realms/steward/protocol/openid-connect/token \
    -d grant_type=password -d client_id=kloakware-smoke -d username=erin.example \
    --data-urlencode "password=$KLOAKWARE_DEV_USER_PASSWORD" -d scope=openid >/dev/null
}

load() {
  docker run --rm --add-host host.docker.internal:host-gateway \
    -v "$here/Login.js:/scripts/Login.js:ro" -v "$run:/out" \
    -e BASE=http://host.docker.internal:8080 -e USERNAME=erin.example \
    -e PASSWORD="$KLOAKWARE_DEV_USER_PASSWORD" -e DURATION="${LOAD_SECONDS}s" \
    "$K6_IMAGE" run --quiet --summary-export=/out/k6-summary.json /scripts/Login.js
}

fresh_stack() {
  log "A fresh stack on $1"
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  KLOAKWARE_IMAGE="$1" dc up --wait --wait-timeout 600 >/dev/null
  docker wait "$(dc ps -aq config-dev)" >/dev/null
  wait_cluster 2
}

# One node to the new image: drained in the proxy first, in three steps
# (no new connections, the current ones finish, then out of rotation),
# restarted, back once ready.
roll() {
  local node=$1 port=$2
  log "Rolling $node: drained, restarted on the new image, back when ready"
  proxy "set server nodes/$node state drain"
  for _ in $(seq 1 40); do
    [ "$(sessions "$node")" = "0" ] && break
    sleep 0.5
  done
  log "$node: $(sessions "$node") sessions left after the drain"
  proxy "set server nodes/$node state maint"
  proxy "shutdown sessions server nodes/$node"
  sleep 2
  KLOAKWARE_IMAGE="$to_image" dc up -d --no-deps "$node" >/dev/null
  wait_node "$port"
  wait_cluster 2
  proxy "set server nodes/$node state ready"
  wait_proxy_up "$node"
  log "$node: back, the proxy says UP"
}

from_version=$(version "$from"); to_version=$(version "$to")
from_image=kloakware/server:rehearsal-from; to_image=kloakware/server:rehearsal-to
log "Rehearsing $from_version -> $to_version"
build "$from_image" "$from"
build "$to_image" "$to"

fresh_stack "$from_image"
[ "$(schema_version)" = "$from_version" ] || fail "the schema should be at $from_version, is $(schema_version)"
# The snapshot before anything changes, whichever path: what the rollback
# drill restores, and what the manual strategy is shown against.
dc exec -T db pg_dump -U kloakware -Fc kloakware > "$run/before.dump"
log "Snapshot before the upgrade: $(wc -c < "$run/before.dump") bytes"

if [ "$(minor "$from_version")" = "$(minor "$to_version")" ]; then
  log "A patch: rolling under load, ${LOAD_SECONDS}s of logins, not one may fail"
  load > "$run/k6.out" 2> "$run/k6.log" &
  k6=$!
  sleep 20
  roll kloakware-2 9002
  roll kloakware-1 9001
  k6_ok=true; wait "$k6" || k6_ok=false
  grep -v "^\s*$" "$run/k6.log" | head -40 || true
  [ "$k6_ok" = true ] || fail "k6 saw a failed request during the roll"
  log "k6: every request answered"
  python3 -I -c 'import json,sys; m=json.load(open(sys.argv[1]))["metrics"]; print("requests:", int(m["http_reqs"]["count"]), "failed:", int(m["http_req_failed"]["passes"]), "p95 ms:", round(m["http_req_duration"]["p(95)"]))' "$run/k6-summary.json" || true
else
  log "A minor: both nodes down, the first new node migrates, the second joins"
  dc stop kloakware-1 kloakware-2 >/dev/null
  KLOAKWARE_IMAGE="$to_image" dc up -d --no-deps kloakware-1 >/dev/null
  wait_node 9001
  dc logs kloakware-1 2>&1 | grep -i "Updating database\|Changes have been successfully applied\|migrat" | head -3 || true
  KLOAKWARE_IMAGE="$to_image" dc up -d --no-deps kloakware-2 >/dev/null
  wait_node 9002
  wait_cluster 2
fi

[ "$(schema_version)" = "$to_version" ] || fail "the schema should be at $to_version, is $(schema_version)"
signs_in || fail "a sign-in after the upgrade failed"
log "At $to_version: the schema says so and a sign-in works"

log "The manual strategy: the migration as SQL for a DBA, nothing run"
dc exec -T db psql -U kloakware -d postgres -q -c "DROP DATABASE IF EXISTS rehearsal" -c "CREATE DATABASE rehearsal" >/dev/null
dc exec -T db pg_restore -U kloakware -d rehearsal < "$run/before.dump" >/dev/null 2>&1 || true
rm -rf "$run/manual"; mkdir -p "$run/manual"; chmod 777 "$run/manual"
# With SQL to write the server writes it and exits; with none to write it
# starts and serves, so the wait is bounded and a server still running after
# it is the second outcome.
manual=$(KLOAKWARE_IMAGE="$to_image" dc run -d --no-deps \
  -e KC_DB_URL=jdbc:postgresql://db:5432/rehearsal \
  -e KC_SPI_CONNECTIONS_JPA_QUARKUS_MIGRATION_STRATEGY=manual \
  -e KC_SPI_CONNECTIONS_JPA_QUARKUS_MIGRATION_EXPORT=/export/migration.sql \
  -v "$run/manual:/export" kloakware-1 start --optimized)
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Running}}' "$manual")" = "false" ] && break
  [ -s "$run/manual/migration.sql" ] && break
  sleep 2
done
docker logs "$manual" > "$run/manual.log" 2>&1 || true
docker rm -f "$manual" >/dev/null 2>&1 || true
if [ -s "$run/manual/migration.sql" ]; then
  log "Manual: the server wrote $(wc -l < "$run/manual/migration.sql") lines of SQL and stopped; the rehearsal database stays at $(schema_version rehearsal)"
else
  log "Manual: nothing to migrate between $(schema_version rehearsal) and $to_version; the server started and served"
fi

log "Rollback: the snapshot restored, the old image back"
dc stop kloakware-1 kloakware-2 >/dev/null
dc exec -T db psql -U kloakware -d postgres -q -c "DROP DATABASE kloakware" -c "CREATE DATABASE kloakware" >/dev/null
dc exec -T db pg_restore -U kloakware -d kloakware < "$run/before.dump" >/dev/null 2>&1 || true
KLOAKWARE_IMAGE="$from_image" dc up -d --no-deps kloakware-1 >/dev/null
wait_node 9001
KLOAKWARE_IMAGE="$from_image" dc up -d --no-deps kloakware-2 >/dev/null
wait_node 9002
wait_cluster 2
[ "$(schema_version)" = "$from_version" ] || fail "after the rollback the schema should be at $from_version, is $(schema_version)"
signs_in || fail "a sign-in after the rollback failed"
log "Back at $from_version: the schema says so and a sign-in works"

dc down --volumes --remove-orphans >/dev/null 2>&1 || true
# The two images go; their layers stay in the build cache for the next run.
docker image rm -f "$from_image" "$to_image" >/dev/null 2>&1 || true
log "Rehearsal $from_version -> $to_version complete"
