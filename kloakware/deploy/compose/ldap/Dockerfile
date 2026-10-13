# OpenLDAP for the laptop and the tests: Debian's slapd, the directory the
# ldap federation in config/realms/steward.json reads. The base
# dc=steward,dc=example is created at build time by the package; the
# administrator's password and the seeded people are set at start from the
# environment, so no secret is baked in.
FROM docker.io/library/debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

RUN set -eux; \
    export DEBIAN_FRONTEND=noninteractive; \
    { \
      echo "slapd slapd/no_configuration boolean false"; \
      echo "slapd slapd/domain string steward.example"; \
      echo "slapd shared/organization string Steward Example"; \
      echo "slapd slapd/backend select MDB"; \
      echo "slapd slapd/password1 password build-time-placeholder"; \
      echo "slapd slapd/password2 password build-time-placeholder"; \
      echo "slapd slapd/purge_database boolean true"; \
      echo "slapd slapd/move_old_database boolean true"; \
    } | debconf-set-selections; \
    apt-get update; \
    apt-get install -y --no-install-recommends slapd ldap-utils; \
    rm -rf /var/lib/apt/lists/*

COPY Entrypoint.sh /usr/local/bin/ldap-entrypoint
COPY Seed.ldif /etc/ldap/seed.ldif
RUN chmod 0755 /usr/local/bin/ldap-entrypoint

EXPOSE 389
HEALTHCHECK --interval=5s --timeout=3s --retries=12 \
  CMD ldapsearch -x -H ldap://127.0.0.1 -b dc=steward,dc=example -s base dn >/dev/null || exit 1
ENTRYPOINT ["ldap-entrypoint"]
