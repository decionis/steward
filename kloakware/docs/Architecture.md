# Architecture: realms, clients, and one server for many markets

The first guide of the kloakware series. It explains the units Keycloak is built from, how they
map onto kloakware's `steward` realm, how to decide between one realm and many when an
organisation operates in several markets, and what the Quarkus distribution's build step changes
about how an image is made and promoted. It ends with the interview questions it answers, Q1, Q11
and Q12 of the plan, each with the file in this repository that proves the answer. The code it
describes is the first workstream, K1: [`server/Dockerfile`](../server/Dockerfile),
[`config/realms/steward.json`](../config/realms/steward.json),
[`deploy/compose/compose.yaml`](../deploy/compose/compose.yaml) and the smoke test under
[`smoke/`](../smoke/).

## The building blocks

**A realm** is the unit of isolation. It owns its users and their credentials, its roles and
groups, its clients, its identity providers and user federations, its authentication flows, its
signing keys, its themes, its session and token lifetimes, its events. Two realms on one server
share nothing but the server: a user in one does not exist in the other, a token from one is
refused by the other, and an administrator of one cannot see the other unless they hold rights in
the `master` realm. The `master` realm exists to administer the others and should hold nothing
else: no application clients, no application users. Kloakware has one application realm,
`steward`, and never puts an application in `master`.

**A client** is an application that asks the realm to authenticate users or to issue tokens. It is
_confidential_ when it can keep a secret (a server) and _public_ when it cannot (a browser, a
mobile app). It declares which flows it may use: the Authorization Code flow for users signing in
through a browser, the client-credentials grant for a service account, the password grant for a
legacy tool that must not exist in production. It declares the exact redirect URIs the realm may
send a code to; anything else is refused. Kloakware's `steward` client is confidential, uses the
code flow only with PKCE required, and names one redirect URI and one backchannel logout URL, both
built from `STEWARD_URL`. The dev overlay's `kloakware-smoke` client is public and allows the
password grant so the smoke test can sign in without a browser; a deployment never applies that
file.

**Client scopes and protocol mappers** decide what goes into a token. A scope is a named bundle of
mappers; a mapper puts one claim in (a user attribute, the realm roles, the email, a group path).
Scopes are _default_ (always applied) or _optional_ (applied when the client asks for them by
name). The built-in `roles`, `profile`, `email` and `basic` scopes are why the smoke test sees
`realm_access.roles` and `preferred_username` in an access token it never asked anything special
for. The `market` scope arrives in K4, where the question of what belongs in a token is dealt with
properly.

**Roles** are of three kinds. _Realm roles_ are realm-wide; _client roles_ belong to one client
and are meaningful only to it; _composite roles_ contain other roles, from either kind. Every realm
has a composite _default role_, `default-roles-<realm>`, granted to every new user. Kloakware's six
`steward-*` realm roles are what Steward maps onto its own `VIEWER`, `OPERATOR`, `APPROVER`,
`OPERATIONS`, `AUDITS` and `ADMIN`; `steward-viewer` sits inside the default role, so a user who was
created and never assigned anything lands on Steward's floor rather than outside it. The smoke test
asserts exactly that: the seeded operator holds `steward-viewer` without anyone having assigned
it.

**Groups** are a hierarchy. A group carries role mappings and attributes, and a member inherits
both, from the group and from its ancestors. Groups are how an organisation is modelled without
inventing a role per department: `/markets/SE` grants nothing a role would not, but a user in it
_is in Sweden_ in a way that policies, mappers and the Admin UI can all read. Markets are groups in
kloakware from K2.

**Users** carry credentials (password, OTP, WebAuthn, and whatever a custom authenticator adds),
role and group memberships, and attributes. Since Keycloak 24 the _user profile_ is declarative: the
realm declares which attributes exist, who may read and edit each, and how it is validated, and
attributes outside the declaration are dropped by default. That is why K1 seeds no `market`
attribute: K2 declares it first. Interviewers like this detail because it is where a Keycloak 22
answer and a Keycloak 26 answer part ways.

**Identity providers** and **user federation** are two different ways to not own the user. An
identity provider is another issuer the realm _brokers_ to: the user signs in there (a corporate
OpenID Connect provider, a SAML IdP, a social login, another realm) and the realm links or creates
a local account for them. User federation is a user store the realm _reads_: an LDAP directory, an
Active Directory, or a custom store behind the User Storage SPI, with the users imported or looked
up on demand and their passwords validated against the store. Both are K6.

**Authentication flows** are the sequences of steps a sign-in goes through: the browser flow
(cookie, identity-provider redirector, the forms, the OTP), the direct-grant flow, the first-broker
login flow, the registration flow. Each step is _required_, _alternative_, _conditional_ or
_disabled_, and conditions can read the user, the client or the request. A custom authenticator is
a step like any other; K5 inserts one after the password form that fires for the markets configured
to need a second factor.

**Sessions and tokens.** A _user session_ (the SSO session) is created at sign-in and ends on
logout, on its idle timeout or at its maximum lifespan; every client the user signs in to during it
gets a _client session_ under it. An _access token_ is a short-lived bearer the client presents to
APIs; a _refresh token_ lets the client obtain a new one without a new sign-in, for as long as the
session lives; an _ID token_ tells the client who signed in. The realm's numbers are in
`steward.json`: five minutes for the access token, thirty minutes idle and ten hours maximum for
the session, refresh tokens revoked on use with zero reuse allowed. The smoke test proves two of
them: `exp - iat` is 300, and a refresh token used twice is refused.

**Keys** are per realm: the realm signs its tokens with its active key and publishes every enabled
key at its JWKS endpoint, so a verifier that caches the document keeps verifying through a
rotation. How to rotate without breaking anyone is Q16, in the SignIn guide.

**Events** are what the realm records about sign-ins, failures, logouts, credential changes and
admin actions. They can be stored, expired, and handed to an event listener; K5's audit listener is
one.

**Organizations**, in the product since Keycloak 26, sit between a realm and a group: several
organisations inside one realm, each with its own domains, its own members and its own identity
providers, so `acme.com` users sign in through Acme's IdP and `globex.com` users through Globex's,
in the same realm, against the same clients. It is the answer to a multi-tenant _application_
whose tenants bring their own identity; it is not a data boundary, which is what Q11 is about.

## One realm or many: the multi-market decision

Three ways to put ten markets on one Keycloak, and the questions that decide between them.

| The organisation needs                                                  | One realm, markets as groups                                                                                                                                | A realm per market                                 | One realm, Organizations                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Single sign-on across markets for shared staff                          | Yes, by construction                                                                                                                                        | No: a realm is an issuer; crossing needs brokering | Yes                                         |
| Users who exist in exactly one market and must not be visible in others | Visible to any admin of the realm                                                                                                                           | Yes                                                | Members scoped to their organisation        |
| A different identity provider per market                                | One IdP list, selected by a hint                                                                                                                            | Yes, naturally                                     | Yes, per organisation, by email domain      |
| A different password policy, MFA rule, theme or locale per market       | One policy; MFA by condition (K5)                                                                                                                           | Yes, each realm its own                            | One policy                                  |
| Local privacy law demanding the user database stay in the country       | No, and neither do the other columns: a realm is logical isolation inside one database. Residency needs a deployment in the country, with its own database. | Same database as every other realm on the server   | Same database                               |
| Delegated administration per market                                     | Fine-grained admin permissions, or none                                                                                                                     | Yes, a realm admin                                 | Organisation membership is not admin rights |
| Operational cost of a change (a client, a mapper, a policy)             | Once                                                                                                                                                        | Ten times, promoted ten times                      | Once                                        |
| Blast radius of a misconfiguration                                      | Every market                                                                                                                                                | One market                                         | Every market                                |

Kloakware takes the first column by default (decision K-D3): one `steward` realm, a market as a
group under `/markets/` and an attribute carried in the token, market-specific behaviour as flows
and policies conditioned on it. The per-market realm is shipped beside it in K2 as a template
rendered from a `markets` variable and exercised in CI for two markets, so the second column is a
variable, not a rewrite. Organizations are evaluated for the case the table shows them for: a
market that brings its own identity provider and wants its own membership without wanting its own
realm.

The row that most candidates miss is residency. A realm shares the server's database with every
other realm, and the database is one thing in one place; "strict data isolation due to local privacy
laws" is not answered by a realm, it is answered by a kloakware deployment in that jurisdiction,
with its own database, its own realm and, for the few people who work across the border,
brokering between the two issuers. The Terraform in K8 is built to be applied per environment and
per cloud for that reason.

## The Quarkus distribution: build time and run time

Keycloak has been a Quarkus application since version 17, and that changed how it is configured.
Options come in two kinds.

**Build-time options** shape the server: which database driver is wired (`db`), which features are
compiled in (`features`), whether the health and metrics endpoints exist (`health-enabled`,
`metrics-enabled`), which cache and discovery stack is used (`cache`, `cache-stack`), the HTTP
relative path, XA transactions. `kc.sh build` reads them and produces an optimised server; the
result is the image. Changing one means a new image.

**Runtime options** are read when the server starts: the database URL and credentials, the
hostname, HTTP and TLS, proxy headers, the bootstrap admin, logging, the remote cache, and every
`--spi-*` option a provider declares. They differ per environment and are passed as environment
variables (`KC_DB_URL`, `KC_HOSTNAME`: the option name upper-cased, dashes to underscores), as
command-line flags, or in `conf/keycloak.conf`, in that order of precedence.

`kc.sh start --optimized` is the start that trusts the build: it skips the augmentation step and
boots in seconds. `kc.sh start` without it re-augments at every start, which is what a laptop
tolerates and a rolling update does not. `kc.sh start-dev` is the development mode with H2, no
build, no hostname, no TLS: fine for trying a feature, wrong for anything a compose file is
supposed to prove.

The anti-pattern this exists to prevent is an image per environment. If the build-time options
differ between staging and production, production runs bytes that staging never ran; if the realm
is baked into the image, every configuration change is a release. Kloakware builds one image, pinned
by digest, and promotes it; what differs between environments is runtime configuration and the
variables the realm file is rendered with. The smoke test and the compose file run the same image
the Terraform will deploy.

Three more things the distribution decided for you, each a question in its own right:

- **The management interface.** Since Keycloak 25, `/health/*` and `/metrics` answer on a separate
  listener, port 9000 by default, so a probe or a scrape never has to pass through the public
  ingress and the public ingress never has to expose them. The compose healthcheck and the smoke
  test both talk to 9000.
- **Hostname v2.** `hostname` is a full URL (`https://login.example.com`), the one every URL the
  server emits is built from; `hostname-admin` separates the admin console's; `hostname-strict`
  requires one to be set and is relaxed only where a test must derive URLs from the request, as the
  smoke test does.
- **The bootstrap admin.** `KC_BOOTSTRAP_ADMIN_USERNAME` and `_PASSWORD` create a temporary admin
  on the first start of an empty database; the next step is a permanent admin, then deleting the
  temporary one. The old `KEYCLOAK_ADMIN` variables are gone.

Providers, the Java extensions of K5 onward, go into `/opt/keycloak/providers/` _before_
`kc.sh build`, because the build wires them. A JAR dropped into a running container does nothing.

## How kloakware is laid out, and why

```text
kloakware/
  pom.xml                   one Keycloak version for the Java API; the license gate; Java 17 target, Java 21 in CI
  server/Dockerfile         the image: build stage with the build-time options, runtime stage started --optimized
  server/providers/         extension JARs, compiled in at build
  config/realms/            the realm, environment-neutral: $(env:...) where an environment differs
  config/realms/dev/        the overlay a laptop and CI apply after it: seeded users, the smoke client
  deploy/compose/           the stack on a laptop, the same pins as the test
  smoke/                    Testcontainers: build the image, apply the realm, sign in, read the roles back
  docs/                     this series
```

The realm file is applied by keycloak-config-cli, which reads a realm representation and brings the
running realm to it: creating what is missing, updating what differs, and removing what it created
before and no longer finds. The dev overlay is a second file for the same realm, applied second,
with `IMPORT_MANAGED_CLIENT=no-delete` so that it does not remove the `steward` client it does not
mention. The Configuration guide, K2, is where this becomes a pipeline with drift detection and
promotion.

## The local stack

`docker compose up --build` in `deploy/compose/` starts PostgreSQL, builds and starts the server,
applies the realm, then the overlay. The admin console is at `http://localhost:8080/admin`, the
realm's discovery document at `http://localhost:8080/realms/steward/.well-known/openid-configuration`,
and the thing to look at after the roles is the discovery document: `backchannel_logout_supported`,
`code_challenge_methods_supported` and `end_session_endpoint` are the three facts Steward's sign-in
will rely on, and the smoke test checks them before anything else.

## Interview questions

### Q1. "How would you design a Keycloak solution for an organisation operating in 10 different countries, where some markets require shared user profiles and others demand strict data isolation due to local privacy laws?"

Start with the two facts the question hides, because the design follows from them. First, "shared
user profiles" means single sign-on: one issuer, one session, one user record; so the markets that
share profiles share a realm. Second, "strict data isolation due to local privacy laws" is about
where data rests, and a realm does not move data anywhere: every realm on a server lives in that
server's one database. So the isolated markets are not realms, they are deployments.

The design, then, has three tiers:

1. **One shared deployment and one realm for the markets that share profiles.** A market is a group
   under `/markets/` and an attribute in the token; market-specific MFA, policies and claims are
   conditions on that attribute, not copies of the configuration. Where a market brings its own
   identity provider and its own membership, an Organization inside the realm, keyed by email
   domain, gives it that without a realm of its own.
2. **One deployment per jurisdiction that demands residency**, with its own database in that
   region, its own realm from the same template, and its own operations. Terraform applied per
   environment makes a deployment a variable; the realm template makes its configuration the same
   file with a different `market`.
3. **Brokering between issuers for the few people who cross the border.** A cross-market
   administrator signs in at their home issuer; the other deployment brokers to it and links the
   account on first login. No user record is copied; the residency promise holds.

What makes it operable: every realm comes from one configuration template in Git, applied by
keycloak-config-cli and the Terraform provider, promoted through the same pipeline; one image for
every deployment; the same dashboards and alerts per deployment. What it costs: a change is
promoted once per deployment, and the isolated markets have no SSO into the shared ones by design,
which is the law's requirement, not a limitation.

_Evidence in this repository:_ the realm with markets as the default model in
[`config/realms/steward.json`](../config/realms/steward.json) and decision K-D3 in the plan; the
per-market template and the drift pipeline in K2; the brokering between issuers in K6; a deployment
as a Terraform environment in K8.

### Q11. "Keycloak Organizations exist since 26. When is an organisation the right tenant boundary instead of a realm, and what does it not give you?"

An organisation is the right boundary when the tenants are _customers of one application_ who bring
their own identity: each organisation has its domains, its members, and its identity providers, so a
user from `acme.com` is routed to Acme's IdP and lands as a member of Acme, in the same realm, under
the same clients, with the same roles vocabulary. That is the SaaS case, and before Organizations it
was solved badly, with a realm per customer and a client copied into each.

What it does not give you is isolation. Organisations share the realm's user table, its clients,
its roles, its flows, its password policy, its keys and its sessions; an organisation's
administrator is a realm administrator with scope, not a separate principal; and the data is in the
same database as every other organisation's. It also does not give a different token lifetime,
theme or MFA rule per organisation, except as conditions you write yourself. So: tenants who need
their own IdP and their own membership list, in one product, with one operations team, are
organisations. Tenants who need their own policy, their own administrators, their own blast radius
or their own jurisdiction are realms, or deployments.

_Evidence in this repository:_ the comparison table in this guide; the Organizations row of
decision K-D3.

### Q12. "Build-time versus runtime options in the Quarkus distribution: what does `kc.sh build` do, why `--optimized`, and what goes wrong when an image is built per environment?"

`kc.sh build` takes the build-time options, the database driver, the features, health and metrics,
the cache stack, and produces an optimised server with those decisions compiled in; the image is
the result. `start --optimized` starts that server without repeating the step, so it boots in
seconds, which is what a rolling update, an autoscaler and a crash recovery all need. `start`
without `--optimized` re-augments on every start, tolerable on a laptop and nowhere else.

Runtime options, the database URL, the hostname, TLS, the proxy headers, the bootstrap admin, the
`--spi-*` settings, are read at start and are what differs between environments; they are passed as
`KC_*` environment variables, flags, or `conf/keycloak.conf`.

An image per environment goes wrong in two ways. The bytes diverge: production runs a build nobody
ran in staging, so the promotion proves nothing. And configuration becomes a release: a redirect URI
or a token lifetime changes, and a new image has to be built, scanned, pushed and rolled. The fix is
one image, pinned by digest, promoted unchanged, with realm configuration applied to it from Git by
a tool that converges the running realm to the file.

_Evidence in this repository:_ [`server/Dockerfile`](../server/Dockerfile), one image, build-time
options in the build stage, `start --optimized` in the runtime stage; the same image under the
compose file and the smoke test; the runtime options as environment in both.
