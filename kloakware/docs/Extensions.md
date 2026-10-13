# Extensions: the Service Provider Interface, from a class to a server

The fifth guide of the kloakware series. It explains how Keycloak is extended in Java: what a
provider and its factory are, how one is registered, configured, packaged, compiled into the image,
tested and kept working across Keycloak releases; then the three extensions K5 adds and why each is
an SPI rather than configuration. It ends with the interview questions it answers, Q7, Q8 and Q18 of
the plan. The code it describes is under [`extensions/`](../extensions/): the audit listener
[`event-listener`](../extensions/event-listener/), the market second factor
[`authenticator-market-mfa`](../extensions/authenticator-market-mfa/), the legacy password hash
[`password-hash-legacy`](../extensions/password-hash-legacy/), beside K4's claim mapper; their
container tests under [`smoke/`](../smoke/); and the simulator in
[`deploy/compose/bankid/`](../deploy/compose/bankid/Simulator.py).

## The SPI, in one page

Keycloak is a set of interfaces with default implementations behind each, and almost every one can
be replaced or added to. An extension point is an **SPI**: a `Spi` with a name (`events-listener`,
`authenticator`, `password-hash`, `protocol-mapper`), a `Provider` interface (what the server calls
per request) and a `ProviderFactory` interface (what the server creates once and asks for providers).
An extension implements both:

- **The factory** lives for the life of the server. `init(Config.Scope)` receives the options
  configured for this provider, `postInit` runs once the session factory exists, `create(session)`
  hands out a provider per request, `getId()` names it, `close()` releases what `init` built. Shared,
  expensive things, a thread pool, an HTTP client, a Kafka producer, belong here.
- **The provider** lives for a request or a session. It gets a `KeycloakSession`, the handle on the
  realm, the user, the transaction, and every other provider. It should hold nothing it did not
  receive.
- **Registration** is a file in the JAR: `META-INF/services/<the factory interface's fully
qualified name>` with the factory class's name in it. Java's `ServiceLoader` finds it; Keycloak
  indexes it at build.
- **Configuration** comes in two places. Server-wide, as an SPI option:
  `--spi-<spi>-<provider>-<key>=value`, or the environment `KC_SPI_<SPI>_<PROVIDER>_<KEY>`, read in
  `init`. Per use, in the realm: an authenticator's execution carries an `AuthenticatorConfigModel`,
  a mapper carries its config map, both declared through `getConfigProperties()` so the Admin UI
  renders a form and the realm file can set them.
- **Packaging** is a plain JAR, with Keycloak's own artifacts as `provided`: the server supplies them
  at run time and the JAR carries only the extension. A dependency the server does not have is shaded
  in, which is what the `kafka` profile does for the Kafka client.
- **Deployment** is `/opt/keycloak/providers/` _before_ `kc.sh build`: the build indexes the JAR and
  compiles its services in. A JAR dropped into a running container does nothing, and a JAR on a
  development server with `start-dev` is hot-reloaded and therefore proves nothing about production.
  Kloakware's Dockerfile compiles the extensions from source in its first stage and copies the JARs
  into the second, so the image is the whole project and every environment runs the same bytes.

Three SPIs the three extensions use, and what each is for:

| SPI                    | Provider interface      | Called when                      | Kloakware's                    |
| ---------------------- | ----------------------- | -------------------------------- | ------------------------------ |
| `events-listener`      | `EventListenerProvider` | Every user event and admin event | `steward-audit`                |
| `authenticator`        | `Authenticator`         | A step of an authentication flow | `steward-market-second-factor` |
| `password-hash`        | `PasswordHashProvider`  | A password is verified or stored | `legacy-sha256`                |
| `protocol-mapper` (K4) | `ProtocolMapper`        | A token is built                 | `steward-claim-mapper`         |

The ones not written, and when they would be: a `UserStorageProvider` when the users live elsewhere
(K6 writes one over Steward's own table); a `PolicyProvider` when a decision needs logic no built-in
policy has; a `RequiredActionProvider` when a user must do something before the session continues;
a `Theme` when the pages must look like the operator's. The rule for choosing: configuration first,
an SPI when the behaviour does not exist, never an SPI to work around a setting one did not find.

## The audit listener

What happened in the identity provider is evidence: who signed in, who failed, who changed a
password, who was signed out by an administrator. Keycloak records events in its own database when
asked; a listener is how they leave it. `StewardAuditListenerProviderFactory` builds the sinks once
from the SPI options and `StewardAuditListenerProvider` turns each event into one
[`AuditEvent`](../extensions/event-listener/src/main/java/com/decionis/kloakware/audit/AuditEvent.java),
the same shape for a user event and an admin event: kind, type, time, realm, user, client, session,
address, error, details. Three sinks:

- **Standard output**, always: one line, prefixed `kloakware-audit`, that a log pipeline routes.
- **Steward's activities endpoint**, when `sink-url` is set: a POST per record, signed with
  HMAC-SHA256 under `sink-secret` over the timestamp and the body. Steward verifies the signature in constant time,
  refuses a timestamp more than five minutes from its own clock, and keeps the record as an activity
  attributed to the user who signs in as that issuer subject (`/api/activities/kloakware`, K5 on the
  Steward side).
- **Kafka**, when `kafka-bootstrap-servers` is set and the JAR was built with `mvn -Pkafka`: one
  message per record, keyed by realm. A default build with a bootstrap server configured refuses to
  start with a sentence, rather than failing at the first event with a stack trace.

Every sink sits behind one outlet,
[`AsyncAuditSink`](../extensions/event-listener/src/main/java/com/decionis/kloakware/audit/AsyncAuditSink.java):
a bounded queue and one daemon thread that drains it. The request thread offers the record and
returns; nothing that handles a sign-in ever writes to standard output or the network for an audit
record. When the queue is full, because standard output is blocked or Steward is slow, the newest
record is dropped and counted, and a warning says so; a dropped record is a line in a log, a blocked
request thread would have been an outage. The first container run of K5 taught this the hard way:
with the sink writing from the request thread and the host's disk nearly full, Docker stalled the
container's standard output, the server's worker threads blocked on it, and every test after the
first sign-in hung.

The listener is enabled per realm, `eventsListeners` in the realm file, beside `jboss-logging`; the
event types it forwards are an option with a default that covers sign-in, sign-out, failures,
credential changes and lockouts. What it does not do, on purpose: block, retry forever, or hold more
than its queue; a sink that fails logs, and standard output keeps the line.

## The market second factor

A rule that configuration cannot express: _users who work this market must present a second
factor, and this is which_. `MarketSecondFactorAuthenticator` sits in the browser flow after the
password form. It reads the user's markets from the markets group and the `market` attribute,
decides with a pure function,
[`SecondFactorDecision`](../extensions/authenticator-market-mfa/src/main/java/com/decionis/kloakware/mfa/SecondFactorDecision.java),
and acts:

- **Not in a configured market**: `context.success()`, and the flow continues. The seeded operators
  work DE and are never asked.
- **OTP**: if the user has no TOTP, the `CONFIGURE_TOTP` required action is added, so the sign-in
  completes with the setup page; the conditional OTP step that follows in the flow enforces it from
  then on. The authenticator decides who needs one; Keycloak's own steps collect and verify it.
- **BankID**: the authenticator starts an order with the Relying Party API, keeps the order reference
  in the authentication session, and shows its own page from a template in the JAR
  (`theme-resources/templates/steward-bankid.ftl`, with its messages beside it). Each return
  collects: pending shows the page again with BankID's hint, complete checks that the personal
  number BankID confirmed is the one on the user's `personalNumber` attribute, failed starts over.
  Against the real API the transport is mutual TLS with a certificate issued to the relying party;
  against the simulator in the compose file it is plain HTTP, and the authenticator is the same
  code. `MarketSecondFactorTest` signs Sven in: password, the BankID page, a pending collect, a
  complete one, the code.

The execution is `REQUIRED` and carries its configuration in the realm file: the markets, the method,
the BankID URL as an environment variable, the attribute names. That is the whole point of a
configurable authenticator: the rule is in Git, per environment, and the Java never changes to move a
market from OTP to BankID.

## The legacy password hash

A migration's first question is whether users must reset their passwords. With a
`PasswordHashProvider` they need not. The legacy system stored SHA-256 over a salt and the password,
one round, both as base64; `LegacySha256PasswordHashProvider` verifies exactly that, and its
`policyCheck` returns false whatever the realm's policy says. That one `false` is the migration: when
a user signs in and the hash verifies, Keycloak asks whether the stored credential satisfies the
policy, hears no, and rehashes the password with the policy's algorithm, argon2, before the request
ends. `LegacyPasswordTest` seeds a user with a legacy hash, signs them in, reads the credential back
through the admin API and finds argon2, then signs them in again.

The provider can encode too, so a migration script may write legacy-shaped credentials through the
admin API: `secretData` with the value and the salt, `credentialData` with the algorithm and one
iteration. The dev overlay seeds one that way. What the migration must also carry: the users who
never sign in keep the weak hash, so a deadline and a forced reset for the rest closes it.

## Testing an extension

Three layers, each cheaper than the next and catching different things:

1. **Pure logic, unit-tested without a server.** The claim's shape, the second-factor decision, the
   hash format, the audit record's JSON and signature. These are the parts that encode the rule, and
   they are tested against known vectors in milliseconds.
2. **The provider in a real server.** Kloakware's smoke module builds the image with the extensions
   compiled in, applies the realm, and drives the server from outside: the token endpoint, the login
   page, the admin API, a receiver for the listener's posts. That proves registration, configuration,
   the flow and the realm file together, which is what breaks in practice. The receiver must be as
   strict as the real endpoint, or the layer proves less than it seems: the first receiver answered
   every post, while Next.js ends a request that carries an `Upgrade` header without a reply, and
   the Java HTTP client offers an h2c upgrade on every cleartext request by default. The sink now
   speaks HTTP/1.1 outright, the receiver closes on an `Upgrade` header the way Next does, and the
   end-to-end run reads the record back from Steward's own database.
3. **Keycloak's own Test Framework**, fully supported since 26.6 with the Arquillian suite
   deprecated: a JUnit extension that starts a Keycloak with the extension on its classpath and
   injects realms, users and clients into the test. It is the right tool when an extension's
   behaviour must be exercised against many server configurations, and it is where the upgrade
   rehearsal of K9 runs the extensions against the next Keycloak before the image moves.

## Keeping extensions working across releases

Keycloak has no long-term-support line, and an SPI is a Java interface, so a release can add a
method, change a signature or remove a class. What keeps an extension alive:

- **One version, in one place.** `keycloak.version` in the parent POM is the API the extensions
  compile against, and the image pin moves with it; a mismatch cannot ship.
- **Compile against the new version first.** A Dependabot bump of the pin compiles the extensions
  in CI; a removed interface fails there, not in production.
- **Run the container tests against the new image.** Registration, configuration and the flow are
  proven again on every bump.
- **Prefer the public SPI to the private.** `keycloak-server-spi` moves slowly;
  `keycloak-server-spi-private` and `keycloak-services` are internal and move freely. The
  extensions here touch the private API only where there is no public one, and each such use is a
  known cost at upgrade time.
- **Read the upgrading guide's deprecations.** Every release lists them; an extension on a
  deprecated API has one release to move.

## Interview questions

### Q7. "Walk me through a time you had to write a custom Keycloak SPI. What was the business use case, and how did you test and deploy the packaged JAR?"

The business case was the audit trail: an operator's compliance team needs every sign-in, failure,
password change and administrator action as evidence in the application's own records, not only in
the identity provider's database, and the rest of the platform wanted the same events on a topic.
Keycloak's event system records events; it does not deliver them. An `EventListenerProvider` does:
a factory, created once, builds the sinks from the SPI options, and a provider per request turns each
`Event` or `AdminEvent` into one record and offers it to an outlet: a bounded queue drained by one
thread to every sink, so no request thread ever writes a record, a slow receiver cannot slow a
sign-in, and an overflow drops and counts rather than waits. The record is signed with HMAC-SHA256
under a shared secret; standard output keeps every line regardless; Kafka is a build profile so the
default image carries no broker client.

Testing was three layers. The record's shape and signature are unit tests against vectors. The
provider is proven in a real server: the image is built with the JAR compiled in, the realm enables
the listener, a test signs a user in and fails one, and a receiver in the test JVM checks the two
records and their signatures. The third layer is Keycloak's Test Framework, for exercising the
provider against other server configurations. Beyond those, Steward's own end-to-end run signs in
through the compose stack and reads the record back from Steward's database; it caught what the
receiver had not, the Java client's default h2c upgrade offer that Next.js answers by closing the
connection. Deployment is a plain JAR with Keycloak's artifacts
`provided`, registered through `META-INF/services`, copied into `/opt/keycloak/providers/` before
`kc.sh build` by the Dockerfile's own Maven stage, so the image is the whole project and the same
bytes reach every environment; configuration is `--spi-events-listener-steward-audit-*` at run time
and `eventsListeners` in the realm file.

_Evidence in this repository:_ [`extensions/event-listener`](../extensions/event-listener/),
`AuditEventTest`, `AuditTrailTest` with its `AuditReceiver`, the `steward-audit` entry in
[`steward.json`](../config/realms/steward.json), the Dockerfile's extensions stage.

### Q8. "If we need to integrate a legacy, proprietary hashing algorithm for existing user passwords during a migration, how would you achieve this in Keycloak?"

With a `PasswordHashProvider`, so that nobody resets a password. The provider implements the legacy
algorithm's `verify`, and its `policyCheck` always answers false. The users are imported with their
existing hashes as credentials naming that algorithm, `secretData` carrying the value and the salt,
`credentialData` the algorithm and the iterations. On the first sign-in Keycloak asks the provider to
verify, succeeds, asks whether the credential satisfies the realm's policy, hears no, and rehashes
the password with the policy's algorithm, argon2 by default in 26, inside the same request. The
legacy hash is gone the moment it was last needed. What the provider must not do is claim the
policy is satisfied, and what the migration must still do is set a deadline: users who never sign in
keep the weak hash until a forced reset.

The alternative, when the legacy system cannot export hashes at all, is a `UserStorageProvider` over
the legacy store with import on first login: Keycloak validates the password against the old system
once, creates the user locally with a fresh hash, and never asks again. K6 writes one over Steward's
own users table.

_Evidence in this repository:_ [`extensions/password-hash-legacy`](../extensions/password-hash-legacy/),
`LegacySha256Test` with its vector, the seeded `legacy.example` in the dev overlay,
`LegacyPasswordTest` reading argon2 back through the admin API.

### Q18. "A Keycloak upgrade breaks a custom SPI. How do you find out before production, and how do you version extensions against Keycloak?"

Before production, in CI, in the order the failure would appear. The extensions compile against
`keycloak.version`, one property in the parent POM that the image pin moves with; a Dependabot bump
of the image is a bump of that property, and a removed interface or a changed signature fails the
build of the pull request. Then the container tests run against the new image: registration,
configuration, the flow, the token, which is where a behaviour change rather than an API change shows.
Then the upgrade rehearsal of K9 runs the whole stack through a rolling update under load. Versioning
is the same discipline: the extension's own version is the project's, its Keycloak version is the
server's, and the two are never different in one artifact. To make breakage rare rather than merely
caught: stay on the public SPI where one exists, treat `keycloak-server-spi-private` and
`keycloak-services` as a cost paid per release, read the upgrading guide's deprecation list on every
bump, and keep the pure logic out of the provider so the part that changes is thin.

_Evidence in this repository:_ `keycloak.version` and the `provided` scopes in
[`pom.xml`](../pom.xml); the Dockerfile's pins; the `verify (java 21)` job on every pull request.
