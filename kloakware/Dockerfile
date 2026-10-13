# The kloakware server image: Keycloak with Steward's extensions compiled in,
# built once with the options that cannot change at run time, started
# --optimized so a container boots in seconds and never recompiles. One image
# for every environment; what differs between dev and production is runtime
# configuration (KC_DB_URL, KC_HOSTNAME, the bootstrap admin) and the realm
# applied to it, never the bytes.
#
# Three stages. The first compiles the extensions under extensions/ from
# source with Maven, so the image is the whole project and nothing is dropped
# into a running container. The second runs Keycloak's own build with the
# extensions in place. The third is the server.
#
# The bases are pinned by digest. Keycloak has no long-term-support line, only
# the newest release receives fixes, so Dependabot's docker ecosystem moves
# the Keycloak pin on purpose, and keycloak.version in pom.xml moves with it.
# An update is rehearsed as a K9 rolling update before it merges.
#
#   docker build -t kloakware/server .                     (from this directory)
#   docker run -p 8080:8080 -p 9000:9000 \
#     -e KC_DB_URL=jdbc:postgresql://db:5432/kloakware -e KC_DB_USERNAME=... -e KC_DB_PASSWORD=... \
#     -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=... \
#     -e KC_HOSTNAME=https://login.example.com kloakware/server
ARG KEYCLOAK_IMAGE=quay.io/keycloak/keycloak:26.8.0@sha256:27b3230fbabb8c9ff3c66c864cf09dcd8a41aca82e5100679d109ef0eeb05741
ARG MAVEN_IMAGE=docker.io/library/maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320

# ---- extensions -------------------------------------------------------------
# Java 21, the server's own level. Keycloak's artifacts are `provided`: the
# JARs built here carry only Steward's code.
FROM ${MAVEN_IMAGE} AS extensions
WORKDIR /build
COPY pom.xml ./
COPY extensions ./extensions
# The extensions' own reactor: the parent is read as a parent, so the context
# needs nothing else of the project.
RUN mvn --batch-mode --no-transfer-progress --file extensions/pom.xml \
      -DskipTests package \
    && mkdir -p /providers \
    && cp extensions/*/target/*.jar /providers/

# ---- build ------------------------------------------------------------------
# Build-time options: the database driver to wire, the features to compile in,
# the cache stack. These shape the server; changing one means a new image.
FROM ${KEYCLOAK_IMAGE} AS build

# PostgreSQL in every environment: the embedded H2 is a laptop convenience that
# would make the compose file prove nothing about production.
ENV KC_DB=postgres
# /health/* and /metrics on the management port (9000), for probes and Prometheus.
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
# Infinispan embedded, nodes discovering each other through a table in the
# database: no multicast, nothing extra to run, the same on a laptop, on EKS
# and on AKS. The Operator switches this to the kubernetes stack where it runs.
ENV KC_CACHE=ispn
ENV KC_CACHE_STACK=jdbc-ping

# The extensions, compiled in: Keycloak's build wires providers it finds here.
COPY --from=extensions /providers/ /opt/keycloak/providers/

RUN /opt/keycloak/bin/kc.sh build

# ---- runtime ----------------------------------------------------------------
FROM ${KEYCLOAK_IMAGE}

LABEL org.opencontainers.image.title="Kloakware" \
      org.opencontainers.image.description="The access service operators sign in to Steward through: Keycloak, extended in Java, configured from Git." \
      org.opencontainers.image.source="https://github.com/decionis/steward" \
      org.opencontainers.image.vendor="Decionis, Inc." \
      org.opencontainers.image.licenses="Apache-2.0"

COPY --from=build /opt/keycloak/ /opt/keycloak/

# The base image's unprivileged user; stated so a reviewer need not look it up.
USER 1000
EXPOSE 8080 8443 9000

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
