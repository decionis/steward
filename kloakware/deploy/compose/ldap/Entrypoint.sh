#!/bin/sh
#
# Sets the administrator's password from LDAP_ADMIN_PASSWORD, seeds the people,
# the markets and the roles with LDAP_USER_PASSWORD for every person, then runs
# slapd in the foreground. Configuration goes over the local socket as root,
# which Debian's slapd trusts to manage the directory.
set -eu
: "${LDAP_ADMIN_PASSWORD:?LDAP_ADMIN_PASSWORD is required}"
: "${LDAP_USER_PASSWORD:?LDAP_USER_PASSWORD is required}"

base="dc=steward,dc=example"
chown -R openldap:openldap /var/lib/ldap /etc/ldap/slapd.d /run/slapd 2>/dev/null || true

slapd -h "ldapi:///" -u openldap -g openldap
for _ in $(seq 1 50); do
  if ldapsearch -Q -Y EXTERNAL -H ldapi:/// -b cn=config -s base dn >/dev/null 2>&1; then break; fi
  sleep 0.2
done

hash=$(slappasswd -s "$LDAP_ADMIN_PASSWORD")
ldapmodify -Q -Y EXTERNAL -H ldapi:/// >/dev/null <<EOF
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcRootPW
olcRootPW: $hash
EOF

if ! ldapsearch -Q -Y EXTERNAL -H ldapi:/// -b "ou=people,$base" -s base dn >/dev/null 2>&1; then
  # As the directory's own administrator: the local root may manage
  # cn=config over the socket, not the data.
  sed "s|@USER_PASSWORD@|$LDAP_USER_PASSWORD|g" /etc/ldap/seed.ldif \
    | ldapadd -x -H ldapi:/// -D "cn=admin,$base" -w "$LDAP_ADMIN_PASSWORD" >/dev/null
  echo "seeded $base"
fi

# Stop the configuring instance and run the serving one in the foreground.
pid=$(cat /run/slapd/slapd.pid)
kill "$pid"
while kill -0 "$pid" 2>/dev/null; do sleep 0.1; done
exec slapd -h "ldap:/// ldapi:///" -u openldap -g openldap -d 256
