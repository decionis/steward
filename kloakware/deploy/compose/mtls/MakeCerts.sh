#!/bin/sh
#
# The certificates the mTLS terminator and the financial-grade client use
# on a laptop and in the smoke test, made once into the directory given
# (the `mtls` volume in compose) and left alone when they are there:
#
#   ca.crt, ca.key              the stack's own authority, which nginx trusts for clients
#   server.crt, server.key      nginx's certificate: localhost and kloakware-mtls
#   steward-fapi.crt, .key      the steward-fapi client's key pair: its certificate is
#                               registered on the client as the JWT credential, signs the
#                               client assertion (private_key_jwt) and is presented at the
#                               terminator for the sender-constrained token
#   steward-fapi.der.b64        that certificate as the realm file takes it, one line
#
# Runs in the alpine/openssl image; a deployment's certificates come from
# its PKI, never from here.
set -eu

out=${1:-/certs}
mkdir -p "$out"
cd "$out"

if [ -f ca.crt ] && [ -f steward-fapi.der.b64 ]; then
  echo "mtls: certificates present in $out, kept"
  exit 0
fi

days=825

openssl req -x509 -newkey rsa:2048 -nodes -days "$days" \
  -keyout ca.key -out ca.crt -subj "/CN=Kloakware mTLS CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1

printf 'subjectAltName=DNS:localhost,DNS:kloakware-mtls,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n' > server.ext
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=kloakware-mtls" >/dev/null 2>&1
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days "$days" \
  -extfile server.ext -out server.crt >/dev/null 2>&1

printf 'extendedKeyUsage=clientAuth\nbasicConstraints=CA:FALSE\n' > client.ext
openssl req -newkey rsa:2048 -nodes -keyout steward-fapi.key -out steward-fapi.csr -subj "/CN=steward-fapi" >/dev/null 2>&1
openssl x509 -req -in steward-fapi.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days "$days" \
  -extfile client.ext -out steward-fapi.crt >/dev/null 2>&1
openssl x509 -in steward-fapi.crt -outform DER | openssl base64 -A > steward-fapi.der.b64

rm -f server.csr steward-fapi.csr server.ext client.ext ca.srl
# nginx reads its key as root; the test copies the client's out. A laptop's files.
chmod 644 ./*.key
echo "mtls: certificates made in $out"
ls -1 "$out"
