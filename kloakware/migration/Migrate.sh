#!/usr/bin/env bash
#
# The migration command (K13), built if it is not: convert what the legacy
# system exported, import it, read the status, revoke past the deadline.
#
#   kloakware/migration/Migrate.sh convert-ldif fixtures/siteminder/users.ldif /tmp/users.jsonl
#   KEYCLOAK_USER=admin KEYCLOAK_PASSWORD=... kloakware/migration/Migrate.sh import /tmp/users.jsonl siteminder
#   kloakware/migration/Migrate.sh status siteminder
#   kloakware/migration/Migrate.sh revoke siteminder --notify
#
# Where kloakware is: KLOAKWARE_URL (http://localhost:8080). As whom:
# KLOAKWARE_CI_CLIENT_SECRET for the service account, or KEYCLOAK_USER and
# KEYCLOAK_PASSWORD for the administrator.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
jar="$here/target/kloakware-migration.jar"
if [ ! -f "$jar" ]; then
  mvn --quiet --file "$here/../pom.xml" -pl migration -am package -DskipTests -Dlicense.skip
fi
exec java -jar "$jar" "$@"
