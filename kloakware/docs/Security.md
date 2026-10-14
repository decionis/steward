# Security

What makes a client financial grade, what a sender-constrained token protects against and how the
two ways of constraining it differ, how a compromised token is dealt with end to end, where the
rate limits sit, how a passkey becomes the second factor, and who the automation signs in as.
K11 binds Keycloak's own FAPI 2 profiles to two clients in the realm, puts a mutual-TLS terminator in
front of the proxy on the laptop, rehearses the revocation runbook as a test, limits the token
endpoint and the login form at the edge, offers WebAuthn beside the OTP, and gives the promotion
pipeline a service account with only the realms' management roles. The plan is
[docs/Kloakware.md](../../docs/Kloakware.md); the realm is
[config/realms/steward.json](../config/realms/steward.json) with the master realm's one addition in
[config/realms/master.json](../config/realms/master.json); the terminator is
[deploy/compose/mtls/](../deploy/compose/mtls/); the limits are in
[deploy/compose/haproxy/haproxy.cfg](../deploy/compose/haproxy/haproxy.cfg); the tests are
`FinancialGradeTest`, `RevocationTest`, `EdgeRateLimitTest`, `PasskeySecondFactorTest` and
`ServiceAccountAdminTest` under `smoke/`.

## The financial-grade clients and the policy that binds them

Keycloak ships the FAPI profiles as global client profiles: `fapi-2-security-profile` and
`fapi-2-dpop-security-profile` among them, each a list of executors. What is ours is not the
profile but which clients it binds. The realm's `clientPolicies` hold two policies, each with one
`client-attributes` condition and one profile:

| Policy              | Condition                              | Profile                        | Sender constraint                      |
| ------------------- | -------------------------------------- | ------------------------------ | -------------------------------------- |
| `steward-fapi-mtls` | the attribute `steward.fapi` is `mtls` | `fapi-2-security-profile`      | the client certificate (holder of key) |
| `steward-fapi-dpop` | the attribute `steward.fapi` is `dpop` | `fapi-2-dpop-security-profile` | a key the client proves per request    |

A client opts in by carrying the marker attribute; the `steward` client Steward signs in with
today carries none and stays as K3 and K4 left it. The marker is the whole coupling, so a Keycloak
upgrade that changes what the profile contains changes it for the bound clients without a change
here. The two demonstration clients, `steward-fapi` and `steward-fapi-dpop`, are what Steward's
client becomes the day a regulator asks: K-D4 named `private_key_jwt` for that day, and Steward's
own client already does it when given a key instead of a secret
(`STEWARD_OIDC_CLIENT_PRIVATE_KEY` or `_FILE`; `infra/auth/oidc/OidcClient.ts` signs the assertion,
PS256 for an RSA key and ES256 for an EC one, with the issuer as audience and a minute to live).

What the profile enforces, executor by executor, and what it meant for the realm:

| Executor                                 | Effect on the bound client                                                                | What the realm had to provide                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `confidential-client`                    | no public client under the profile                                                        | `publicClient: false`                                      |
| `secure-client-authenticator`            | `client-jwt` or `client-x509` only; `client-jwt` the default                              | `clientAuthenticatorType: client-jwt` and the certificate  |
| `secure-client-uris`                     | every URI https, no wildcard                                                              | `STEWARD_FAPI_URL`, `https://steward.example` on a laptop  |
| `secure-signature-algorithm`             | tokens and request objects signed PS256 or ES256, never RS256                             | a PS256 key provider (below)                               |
| `secure-signature-algorithm-signed-jwt`  | the client assertion itself PS256 or ES256                                                | the test's RS256 assertion is refused                      |
| `consent-required`                       | the user consents to the client once                                                      | the test posts the consent page                            |
| `full-scope-disabled`                    | only the scopes the client is given                                                       | `fullScopeAllowed: false`, as every client here already is |
| `reject-implicit-grant`                  | the implicit flow off                                                                     | already off                                                |
| `pkce-enforcer`                          | S256, mandated                                                                            | already mandated realm-wide (K3)                           |
| `secure-client-authentication-assertion` | the assertion's audience is the issuer, one audience, a short life                        | the assertion in the test and in Steward's client          |
| `secure-par-content`                     | the pushed request carries no request object to double-check                              | nothing                                                    |
| `holder-of-key-enforcer` (mTLS profile)  | the certificate presented at the token endpoint is bound into the token and checked after | the terminator, the lookup provider                        |
| `dpop-bind-enforcer` (DPoP profile)      | a DPoP proof with every token request; the proved key bound into the token                | nothing on the server                                      |

Pushed authorisation requests are the client's `require.pushed.authorization.requests`: an
authorisation request that was not pushed first is refused, which the test shows with a plain
redirect to the authorisation endpoint. A pushed request is authenticated like a token request, so
the client assertion is presented there as well, and the browser is sent to the authorisation
endpoint with nothing but the `request_uri` it got back.

**The client's key.** `private_key_jwt` needs the issuer to know the client's public key. Keycloak
takes it three ways, a JWKS URL, a JWKS inline, or one certificate registered as the JWT credential,
and the realm uses the third: the attribute `jwt.credential.certificate` is the certificate as
base64 DER on one line, which is what a secret store or an environment hand over cleanly, where a
JWKS inside a JSON string would have to be escaped. The same certificate is what the client
presents at the terminator for the mTLS-bound token, so one key pair stands for the client in both
places. On a laptop the certificate maker in `deploy/compose/mtls/MakeCerts.sh` makes it into the
`mtls` volume and the config-cli container reads it from there; a deployment passes
`KLOAKWARE_FAPI_CLIENT_CERTIFICATE` from its PKI like the other secrets.

**The keys as code.** A PS256 token needs a PS256 key, and a new realm has none, only RS256, so the
realm file gained a `org.keycloak.keys.KeyProvider` component named `rsa-ps256-generated`. The
lesson that came with it: once a provider type appears under `components`, config-cli manages that
type, and would delete the four providers Keycloak made for the realm at creation. So the file
lists those four by their names and configuration as Keycloak made them, and applying it changes
nothing about them: the RS256 key kept its id across the apply, which the JWKS before and after
showed, and every token Steward verifies kept verifying. The PS256 key sits beside it at the same
priority; an algorithm picks its own key, so the two never compete.

Two more lessons from applying it: the `client-attributes` condition stores its attributes as a
JSON string inside the configuration, not as an array, and a policy saved with the array is
accepted by the admin API and then throws on every client operation until it is fixed; and a
client's description is a 255-character column, which fails as a flush deep inside client creation
with "Database operation failed" and nothing more.

## Mutual TLS at the terminator

Keycloak does not terminate TLS behind a proxy; the proxy does, and hands the client certificate
over in a header that a lookup provider reads. On the laptop that proxy is an nginx in front of
HAProxy, `deploy/compose/mtls/nginx.conf`, on 8443:

- `ssl_verify_client optional`: a certificate is asked for, not demanded, because the login page
  and the clients that are not sender-constrained need none; one that fails verification is
  refused with 495 before anything downstream could mistake it for a verified one.
- `proxy_set_header ssl-client-cert $ssl_client_escaped_cert`: the certificate, URL-encoded, which
  is how Keycloak's `nginx` lookup provider expects it.
- The request goes to HAProxy's second entry on 8081, which sets `X-Forwarded-Proto https` and keeps
  the header. Both proxies also forward the host the client named (`X-Forwarded-Host`), which a
  node whose hostname is not fixed, the test stack's, needs to build its URLs with the port the
  client used; the compose nodes have `KC_HOSTNAME` and ignore it. The plain entry on 8080 deletes `ssl-client-cert` and `ssl-client-verify` from every
  request, so a certificate header can only arrive through the terminator; the test forges one on
  the plain entry and is refused.

On the server the provider is chosen in the image, `spi-x509cert-lookup--provider=nginx` in the
Dockerfile, and the header's name and `trust-proxy-verification=true` are run-time options: nginx
verified the chain, Keycloak reads the leaf. The token the mTLS client gets carries
`cnf.x5t#S256`, the certificate's thumbprint, and the holder-of-key executor checks the certificate
on the request against it at refresh, revocation, userinfo and logout, so a token copied off the
wire is useless without the private key that goes with the certificate.

On the laptop the hostname is fixed at `http://localhost:8080` (K1), so the discovery document read
through 8443 still names 8080 for its endpoints; the terminator is the test's path and a `curl
--cert` path, not a second hostname. A deployment has one hostname and terminates at the ingress:
ingress-nginx, which both platforms in K8 run, does the same with the annotations
`auth-tls-secret` and `auth-tls-pass-certificate-to-upstream`, and sends the same header under the
same name.

## DPoP

Where a certificate cannot travel, because the ingress is a managed one that will not pass it or
the client is a native application without a PKI, DPoP binds the token to a key the client holds:
every token request carries a `DPoP` header, a JWT signed with that key with the key itself in the
header and the method, URL, a fresh id and the time in the claims; the token comes back with
`token_type: DPoP` and `cnf.jkt`, the key's thumbprint; and every use of the token at a resource
carries a fresh proof, now with the token's hash in it. The test gets the token for
`steward-fapi-dpop` with a proof the JDK signed, sees the thumbprint in the token, and sees the
same request refused without the header.

## The compromised-token runbook

The SignIn guide answered Q5 by design: short tokens, rotating refresh tokens, the session as the
kill switch, introspection where the window cannot be tolerated. This step runs the runbook as a
test, `RevocationTest`, one step at a time:

| Step                           | Where                                                          | What the test proves                                                                                            |
| ------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Revoke the refresh token    | `POST /protocol/openid-connect/revoke` with the token          | the next refresh with it is `invalid_grant`                                                                     |
| 2. End the user's sessions     | `POST /admin/realms/steward/users/{id}/logout`                 | introspection says `active: false` at once, while the access token's signature is still inside its five minutes |
| 3. Tell the applications       | the backchannel logout the realm posts to the `steward` client | Steward's endpoint receives the logout token naming the session's `sid`                                         |
| 4. Everything, everyone        | `POST /admin/realms/steward/logout-all`                        | the realm's `notBefore` moves, tokens issued before it are inactive, a fresh sign-in works                      |
| 5. The client's own credential | a new certificate or secret in the realm file, applied         | K2's convergence; not a step of this test                                                                       |

The five-minute window is the design, not a gap: the access token's signature verifies for five
minutes and no revocation changes that, which is why the operations that cannot wait introspect
first, as `steward-api` does in the test, and why everything else trusts the signature and the
session. Introspection has a condition of its own since Keycloak 26: the client asking must be in
the token's audience, or the answer is `active: false` with the reason only in the server's event,
"Client 'steward-api' is not in the token audience". That is right, and it was missing: a token
meant for Steward should say which API may accept it, so the `steward` scope now carries an
audience mapper naming `steward-api` in the access token, lightweight included, and the ID token's
audience stays the client. The not-before has a granularity of its own: a second, so a token
issued within the same second as the push is before it too, which the test waits out. The not-before is the realm-wide version of the same idea, for the day the key is the
thing compromised; `push-revocation` carries it to adapters with an admin URL, which Steward does
not have because it gets the backchannel logout instead.

## Rate limits at the edge

The realm's brute-force detection counts failures per user; what it does not stop is a flood that
costs a password hash per request or a token request a second from one source for an hour. HAProxy
keeps a table of sources with two counters over ten seconds: requests to the token endpoint, and
posts to the login form, the one where a password is tried. Past the limit the answer is 429 and
the node never sees the request:

| Counter                                     | Default per source per ten seconds | Set by                      |
| ------------------------------------------- | ---------------------------------- | --------------------------- |
| `/realms/*/protocol/openid-connect/token`   | 300                                | `KLOAKWARE_EDGE_TOKEN_RATE` |
| `POST /realms/*/login-actions/authenticate` | 60                                 | `KLOAKWARE_EDGE_LOGIN_RATE` |

Behind the terminator the source is the address nginx saw, read from `X-Forwarded-For`, not nginx.
`EdgeRateLimitTest` floods both and sees the first 429 near where the limit says, and the login
page's GET unaffected; near, because HAProxy's rate counters are two periods with the older one
weighted down as it ages, so a burst straddling the boundary is seen as fewer than it was, which
makes the limit a ceiling on a sustained rate rather than an exact count of a burst; it waits the window out afterwards so the classes after it are not counted
against its flood. The limit is per source, and that is its caveat: an office behind one address is
one source, and a load generator is one source pretending to be thousands, so the upgrade
rehearsal and the load that finds the knee bring the proxy up with the two values lifted. In a
deployment the same two limits belong on the ingress or the WAF in front of it, where the source
address is real.

## Passkeys as the second factor

The conditional subflow `steward-browser second factor` runs when the user has configured
something it can use: `conditional-user-configured` required, then `webauthn-authenticator` and
`auth-otp-form` as alternatives, so a user with a passkey is asked for the passkey and a user with
an OTP for the OTP. The realm's WebAuthn policy names `Kloakware` as the relying party, ES256 and
RS256 as the algorithms, attestation `none` (the authenticator's make is not a concern) and user
verification `preferred`; the relying-party id is left empty to be the hostname. The registration
action `webauthn-register` is on, so an operator registers a passkey from the account console or
is told to by a required action on the user.

`PasskeySecondFactorTest` reads the flow and the policy back and then tells `ops.example` to
register one: after the password the realm answers with the registration page rather than the
code. The ceremony itself needs an authenticator, which a test JVM is not; what is proven is that
the realm asks for the passkey where it should. Passkeys as the first factor are a different flow,
`webauthn-authenticator-passwordless`, and were not chosen: the market step from K5 and the
password's history sit on the first factor, and the passkey is the step-up.

## The admin API behind a least-privilege service account

The promotion pipeline applied the realms as the bootstrap administrator through K9, which is the
master realm's `admin`: every realm, every user, forever. K11 gives it `kloakware-ci`, a client in
the master realm with service accounts on and nothing else on, whose service account holds the
management roles of the steward and corp realms (`steward-realm` and `corp-realm`, the clients
master keeps per realm) and no role of master's own. `ServiceAccountAdminTest` signs in with it,
applies the realm files as the pipeline would and sees them converge, reads the two realms, and is
refused master's users, master's clients and the creation of a realm.

The account is created from `config/realms/master.json`, applied by the administrator after the
realms, since master's per-realm clients exist only once the realms do, and with
`IMPORT_MANAGED_CLIENT=no-delete` so what else master holds stays. `config/promote/ApplyRealm.sh`
has the two modes: given `KLOAKWARE_CI_CLIENT_SECRET` it signs in with client credentials against
master and applies the realms; given the administrator's password instead it applies the realms and
then master's file, which is the first run of an environment and the moment the administrator's
password goes back to the vault. The Terraform Job that applies the realm in-cluster (K8) still
reads the administrator's Secret, since it runs inside the platform the administrator was
bootstrapped on; moving it to the service account is the same two environment variables and is
left for when the pipeline, not the Job, is the only thing that applies.

## Interview questions

### Q4. "In your previous payment dashboard project, how did you secure financial transactions? Did you utilize advanced OAuth profiles like FAPI (Financial-grade API) or Mutual TLS (mTLS)?"

With the FAPI 2 Security Profile where the transactions were, and the plain profile everywhere else,
because the profile is expensive to carry and only worth it where the token moves money.

FAPI is a set of constraints on OAuth that close the gaps a plain code flow leaves: the client
proves itself with a signed assertion (`private_key_jwt`) or a certificate instead of a shared
secret, the authorisation request is pushed to the issuer first so nothing about it travels through
the browser, PKCE is mandatory, every URI is https, tokens are signed with PS256 or ES256, and the
access token is bound to its sender, either to the certificate presented over mutual TLS or to a
key the client proves with each request (DPoP). The binding is what makes a token taken off a
log, a proxy or a browser worthless on its own. Keycloak ships the profile as a client profile and
the work is binding it: a client policy with a condition that selects the clients and the profile
as its action, the issuer's own PS256 key, the client's certificate registered for the assertion,
and a proxy that terminates mutual TLS and passes the certificate in the header Keycloak's lookup
reads, with the plain entry stripping that header so it cannot be forged. Then the tests that show
the refusals, which is the part a reviewer wants to see: a request without the certificate, a
certificate forged in the header, an assertion signed with the wrong algorithm, a request that was
not pushed, a DPoP request without its proof. Mutual TLS also authenticates the client
(`client-x509`), which the profile allows, but the assertion is the better default because it
survives an ingress that cannot pass certificates, and the certificate is then only the binding.

_Evidence in this repository:_ the two policies, the two clients and the PS256 key in
`kloakware/config/realms/steward.json`; the terminator in `kloakware/deploy/compose/mtls/`; the
header stripped on the plain entry in `kloakware/deploy/compose/haproxy/haproxy.cfg`; the lookup
provider in `kloakware/Dockerfile`; the whole flow with its refusals in `FinancialGradeTest`;
Steward's own `private_key_jwt` in `infra/auth/oidc/OidcClient.ts` and `OidcClient.test.ts`.

### Q26. "DPoP versus mTLS-bound tokens: what each protects against, and when you pick which."

Both bind the token to something only the legitimate client has, so both protect against the same
thing, a token used by whoever got hold of it; they differ in where the proof lives and what the
infrastructure must carry.

Mutual TLS binds the token to the client certificate presented at the TLS layer: the token carries
the certificate's thumbprint, and the issuer and every resource server check the certificate on
the connection against it. The proof is in the transport, free per request once the connection is
up, and it is verified by the proxy, which must then pass the certificate to the server in a header
and must be the only path on which that header can arrive. It needs a PKI for clients, and an
ingress that terminates mutual TLS and passes certificates, which a managed one may not. DPoP binds
the token to a key pair the client made itself: each request carries a proof signed with it,
naming the method, the URL, the time and the token's hash, and the token carries the key's
thumbprint. The proof is at the application layer, so it crosses any proxy, needs no PKI and no
certificate on the ingress, and works for a native or single-page application that could never hold
a client certificate; its cost is a signature per request and the replay checks on the proof's id
and time. Pick mutual TLS between services that already have certificates and a proxy you control,
which is the bank-to-bank case; pick DPoP for clients outside your PKI and for ingresses that will
not pass certificates, which is most public clouds by default. The realm here carries both, each
bound to one client by its own policy, and the choice is the attribute on the client.

_Evidence in this repository:_ `steward-fapi` with `tls.client.certificate.bound.access.tokens` and
`steward-fapi-dpop` with `dpop.bound.access.tokens` in `kloakware/config/realms/steward.json`; the
`cnf.x5t#S256` and `cnf.jkt` claims and the refusals in `FinancialGradeTest`; the proof built in
`smoke/.../Jws.java`.

### Q27. "How do you keep the admin API, and the services accounts that automate it, least privilege?"

By never automating as the administrator, and by making every account that automates a client in
the master realm with the roles of the realms it manages and nothing of master's own.

The master realm's `admin` is every realm and every user, and a pipeline that signs in as it has a
secret that is the whole installation. Keycloak keeps a client per realm inside the master realm
(`steward-realm`, `corp-realm`) with that realm's management roles, so a service account in master
can be given exactly the realms it applies, and a service account in a realm can be given that
realm's `realm-management` roles and nothing beyond it. The pipeline's account is a client with
service accounts on and every other flow off, authenticated with client credentials, its secret in
the environment's secret store and not in any file; its roles are the two realms' management
roles, so it can apply the realm files and cannot read master's users, cannot create a realm and
cannot touch its own client. The administrator creates it once, from a file, and the
administrator's password goes back to the vault. The remaining practices are the ordinary ones:
one account per automation rather than one for all of them, so a leaked secret has one blast
radius and one rotation; admin events on, with the details, so what the account did is a record;
short access tokens for the account; and the admin console itself behind the organisation's
identity provider with a second factor, not local passwords. The test signs in as the account,
applies the realms as the pipeline would, and is refused everything master's.

_Evidence in this repository:_ `kloakware/config/realms/master.json`; the two modes in
`kloakware/config/promote/ApplyRealm.sh`; the admin events in
`kloakware/config/realms/steward.json`; `ServiceAccountAdminTest`.

### Q5, revisited. "If a user's token is compromised on the payment dashboard, how does your architecture handle immediate revocation across multiple microservices?"

The SignIn guide answered this by design: five-minute tokens, rotating refresh tokens with reuse
detection, the session as the kill switch, backchannel logout joining the issuer's session to
Steward's, introspection before the operations that cannot wait. K11 runs that runbook as a test
and adds the piece that makes revocation unnecessary for the common theft: with the token bound to
the client's certificate or to a key the client proves, a token taken on its own cannot be used,
so the revocation is for the case where the client itself is compromised, and then it is the
client's credential that is rotated in the realm file. The test revokes a refresh token and sees it
dead, ends a session and sees introspection turn inactive inside the signature's five minutes,
sees Steward's endpoint receive the logout token naming the session, and moves the realm's
not-before with logout-all and sees everything issued before it refused while a fresh sign-in works.
Across services that is the whole mechanism: the gateway verifies signatures and the not-before
locally, introspects for the high-value operations, and every service behind it trusts the
gateway; nothing has to be told about one token, because the session is what is ended and the
token binding is what makes a stray token inert.

_Evidence in this repository:_ `RevocationTest`, step by step; the audience mapper on the
`steward` scope in `kloakware/config/realms/steward.json`; the backchannel logout endpoint in
`app/api/auth/oidc/backchannel-logout/route.ts`; the binding in `FinancialGradeTest`.
