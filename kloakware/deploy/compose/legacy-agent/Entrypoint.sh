#!/bin/sh
#
# The legacy agent shim's start: fetch the realm's active signing key from
# the realm's public endpoint, write it as PEM where the proxy's jwt_verify
# reads it, then run HAProxy. A real shim reads the JWKS and follows a
# rotation; this one is restarted after one, which the Migration guide says.
set -eu

realm=${KLOAKWARE_REALM_URL:-http://kloakware:8080/realms/steward}
# Written where the haproxy user may write; the configuration directory is root's and read-only.
pem=/tmp/realm.pem

for attempt in $(seq 1 150); do
  if key=$(wget -q -O - "$realm" | sed -n 's/.*"public_key":"\([^"]*\)".*/\1/p') && [ -n "$key" ]; then
    break
  fi
  sleep 2
done
[ -n "${key:-}" ] || { echo "legacy-agent: no public key at $realm" >&2; exit 1; }

{
  echo "-----BEGIN PUBLIC KEY-----"
  echo "$key" | fold -w 64
  echo "-----END PUBLIC KEY-----"
} > "$pem" || { echo "legacy-agent: cannot write $pem" >&2; exit 1; }
[ -s "$pem" ] || { echo "legacy-agent: $pem is empty" >&2; exit 1; }
echo "legacy-agent: realm key written to $pem, serving on 8082"
exec haproxy -f /usr/local/etc/haproxy/haproxy.cfg
