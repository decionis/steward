# The interview questions, answered

Every question the brief asked and every one the plan added, with the answer as the guide that
proves it wrote it. Generated from the guides' own "Interview questions" sections by
`scripts/AggregateInterviewQuestions.mjs`; edit the guide, not this file. Q1 to Q10 are the brief's
own, in [docs/Kloakware.md](../../docs/Kloakware.md); Q11 onward were added there.

## The brief's ten

### Q1. "How would you design a Keycloak solution for an organisation operating in 10 different countries, where some markets require shared user profiles and others demand strict data isolation due to local privacy laws?"

_Answered in [Architecture](Architecture.md)._

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
[`config/realms/steward.json`](../config/realms/steward.json) and decision K-D3 in [the plan](../../docs/Kloakware.md); the
per-market template and the drift pipeline in K2; the brokering between issuers in K6; a deployment
as a Terraform environment in K8.

### Q2. "Can you explain how Infinispan works inside a multi-instance Keycloak deployment? How do you prevent replication lag or split-brain scenarios across environments?"

_Answered in [Clustering](Clustering.md)._

Infinispan is the in-memory layer every node carries; the database is the truth, and the design is
to make a node loss cost nothing a user would notice.

**How it works.** Each node embeds Infinispan with three kinds of cache. Local caches hold a per-node
copy of realms, users and keys, invalidated across the cluster when a node writes. Distributed
caches hold sessions and logins in flight, each entry on two owner nodes, fetched from an owner by
whoever needs it. Since 26 the user and client sessions are also written to the database, so the
distributed caches are an accelerator over rows rather than the only copy. JGroups carries it all,
encrypted with certificates the nodes manage themselves; nodes find each other through a table in
the shared database, jdbc-ping, the one discovery mechanism that needs nothing beyond what they
already share.

**Replication lag.** Within a cluster there is none to prevent: writes to a distributed cache are
synchronous to the owners, and the cluster spans one low-latency network, the availability zones of
one region. Across regions lag is real, which is why the design does not run one cluster across
regions, nor two active regions on one database. Two sites in one region use the multi-site feature
with an external Infinispan replicating between them and one multi-AZ database; a second region is a
standby.

**Split-brain.** A partition produces two views, each serving its users from the shared database;
what is lost is what only memory held, logins in flight and failure counters, and that loss is
bounded by design, since sessions are in rows. The stack's failure detection decides how fast the
partition is seen and its merge protocol how fast it heals; the defaults, forty seconds to suspect a
silent node and up to thirty to merge, suit a cloud network and are tunable through the cache
configuration file when they do not. Transport encryption keeps a stray node from joining, and
starting one node before the rest on an empty database keeps two from racing to migrate the schema.
The repository runs a cluster of two on a laptop and in the tests, and the tests stop a node under a
session and watch the cluster shrink and grow.

### Q3. "How do you handle database migration scripts when upgrading a clustered Keycloak environment in production without causing downtime?"

_Answered in [Upgrades](Upgrades.md)._

By knowing which updates migrate, letting Liquibase run the ones that do under its lock from one
node, and rehearsing the duration on a copy of production first.

Keycloak migrates its own schema with Liquibase on the first start of a newer version: the first
node takes the lock in `databasechangeloglock`, applies the change sets, records them, and writes
the version; any other node waits for the lock and then finds nothing to do. So the cluster never
migrates twice, and the question is only when the first new node starts. A patch migrates nothing
and is rolled one node at a time, each drained from the load balancer before it stops, with the old
and new nodes in one cluster meanwhile; the rehearsal runs that under a login load and fails on one
failed request. A minor migrates and cannot share a cluster with the old version, so every node
stops, the first new one migrates, the rest join: downtime is the migration's duration, which the
staging rehearsal on a copy of production measures before the window is booked. Where the database
is governed, the manual strategy writes the SQL to a file for a DBA to run in the window, and the
server starts after it on a schema it finds current. A snapshot precedes every minor; the next
question is what it is for.

### Q4. "In your previous payment dashboard project, how did you secure financial transactions? Did you utilize advanced OAuth profiles like FAPI (Financial-grade API) or Mutual TLS (mTLS)?"

_Answered in [Security](Security.md)._

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

### Q5. "If a user's token is compromised on the payment dashboard, how does your architecture handle immediate revocation across multiple microservices?"

_Answered in [SignIn](SignIn.md)._

By never relying on revoking the token. The access token lives five minutes, so the exposure of any
single token is bounded before anything else is done. The refresh token rotates on every use with
reuse detection, so a stolen refresh token is caught the moment both parties use it, and the realm
ends the chain. The session is the kill switch: Steward's session is a row, and revoking it refuses
the next request from that browser at once; the issuer's session has the same property, and
OpenID Connect Back-Channel Logout joins the two, so ending the session at the issuer, from any
application or the admin console, ends it in Steward within one request. For the operations that
cannot tolerate even the five-minute window, the API introspects the token at the issuer before
acting, on those operations only. Across services, the gateway validates signatures locally,
honours the realm's not-before policy, introspects where it must, and the services trust the
gateway; the browser holds no token at all, which removes the most common theft in the first
place.

_Evidence in this repository:_ the lifetimes in `kloakware/config/realms/steward.json` and the
refusal of a reused refresh token in `SignInSmokeTest`; the session row and its revocation in
`application/auth/IdentityStore.ts` and `TypeOrmIdentityStore.test.ts`; the backchannel logout in
`app/api/auth/oidc/backchannel-logout/route.ts`, proven end to end by
`test/e2e/KloakwareSignIn.test.mjs`.

### Q5, revisited. "If a user's token is compromised on the payment dashboard, how does your architecture handle immediate revocation across multiple microservices?"

_Answered in [Security](Security.md)._

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

### Q6. "How did you prevent token bloat in your RBAC solution? If a user has hundreds of roles across different markets, how do you keep the JWT size manageable?"

_Answered in [Tokens](Tokens.md)._

By not putting roles in the token. Keycloak's default is full scope, every realm role the user holds
in `realm_access.roles`, prefixed, plus the profile; for a user with hundreds of roles across markets
that is a token of kilobytes, parsed by every service, logged by every hop, stale for its lifetime.
Three moves fix it. Full scope off, and the `roles` scope removed from the client, so no role enters
the token by default. A custom protocol mapper, a ProtocolMapper SPI compiled into the server, that
writes one compact claim in the application's own vocabulary, roles without prefix and composites
resolved, plus the one attribute the decision needs, the user's markets; the mapper, not the client,
decides what a role is worth saying. And the lightweight access token, so the profile is `userinfo`'s
and the access token says who, what and where. Measured on the same user: 1462 bytes and 21 claims
to 930 bytes and 10, with the subject, the session and the compact claim the only identity in it. For the hundreds-of-roles case the answer goes one step further: roles are not a
per-market list at all; the token carries the role kinds and the markets, and a policy engine joins
them per request, which is what Authorization Services does on the `steward-api` resource server.

_Evidence in this repository:_ the `steward` scope and the `kloakware-fat` client in the realm
files; `StewardClaimMapper` and its unit test; `TokenShapeTest` with the measured sizes;
`OidcRoleMapper` reading the compact claim; `AuthorizationServicesTest`.

### Q7. "Walk me through a time you had to write a custom Keycloak SPI. What was the business use case, and how did you test and deploy the packaged JAR?"

_Answered in [Extensions](Extensions.md)._

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

_Answered in [Extensions](Extensions.md)._

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

### Q9. "How do you ensure environment consistency between Dev, Staging and Production in Keycloak? Describe your CI/CD pipeline for Keycloak realm configurations."

_Answered in [Configuration](Configuration.md)._

Consistency comes from one file and one image, not from discipline. The realm is a JSON
representation in Git, applied by keycloak-config-cli, which converges the running realm to the
file: creates what is missing, updates what differs, removes what it created and no longer finds.
Everything that must be the same everywhere, lifetimes, policies, roles, flows, scopes, has one
value in the file. Everything that legitimately differs, where kloakware answers, where the
application runs, the client secret, the administrator, is substituted from the environment at apply
time and never written down.

The pipeline: a change is a pull request; CI applies the realm to a fresh server in a container,
signs a user in through the login page with PKCE, and proves that a change made by hand is undone by
the next apply. Merging applies nothing. A tag starts the promotion workflow, which applies the file
to dev, then QA, then staging, then production, each a GitHub environment with its own secrets and
its own required reviewers, in that order, stopping at the first failure. The image that applies it
is pinned by digest, so the tool is as reproducible as the file. Rollback is a tag on the previous
commit. The Terraform half, the market realms, follows the same shape with `plan` as the gate and
`apply` behind the environment.

_Evidence in this repository:_ [`steward.json`](../config/realms/steward.json) with `$(env:...)`
for what differs; [`ApplyRealm.sh`](../config/promote/ApplyRealm.sh) and
[`kloakware-promote.yml`](../../.github/workflows/kloakware-promote.yml); `RealmConvergenceTest`
and `BrowserSignInTest` in CI.

### Q9, revisited. "How do you ensure environment consistency between Dev, Staging and Production in Keycloak? Describe your CI/CD pipeline for Keycloak realm configurations."

_Answered in [Upgrades](Upgrades.md)._

The Configuration guide answered this with the realm as a file and config-cli converging every
environment to it, drift detected on every pull request. With K8 and K9 the pipeline runs: the realm
files committed at a tag are applied to QA, staging and production in turn by the promote chain, the
platforms and the image by the Terraform chain, each environment behind its reviewers, and nothing
is read back from a running environment. Consistency is not a property to check afterwards; it is
that every environment is produced from the same commit by the same script, and the rehearsal runs
that script twice against one stack to show the second apply changes nothing.

### Q10. "What metrics do you monitor in a production Keycloak instance to proactively catch performance bottlenecks before they impact users?"

_Answered in [Observability](Observability.md)._

Four numbers in order of how early they move, and the event metrics beside them for what users are
doing.

**The database pool's wait time** moves first: `agroal_blocking_time_average_milliseconds` and
`agroal_awaiting`. Every request holds a connection for its duration, so when the pool is exhausted
requests queue for one before they do any work, and the queue is latency users feel while CPU still
looks fine. **The token endpoint's p95**, from `http_server_requests_seconds` histograms, moves
second: Steward's sign-in and every refresh go through it, and it is the endpoint where the pool and
the password hash meet. **Password hashes a second**, `keycloak_credentials_password_hashing_validations_total`,
and **CPU** say when the argon2 work itself is the limit, which is the ceiling on logins a node can
take and the reason to add nodes rather than connections. Behind those, the JVM's time in GC pauses
and heap say whether the session caches fit, and `vendor_cluster_size` with the JGroups suspicion
counters say whether the cluster is whole. The user-event metrics, tagged by realm, client and
provider, say what the load is made of: logins, refreshes, failures by error, which turns a
latency into a cause, and each sample's exemplar leads to the trace of a request that produced it.
The alerts in the repository are these numbers with thresholds and the reason for each, and the
dashboard is the same numbers on one screen.

## The added questions

### Q11. "Keycloak Organizations exist since 26. When is an organisation the right tenant boundary instead of a realm, and what does it not give you?"

_Answered in [Architecture](Architecture.md)._

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
decision K-D3 in [the plan](../../docs/Kloakware.md).

### Q12. "Build-time versus runtime options in the Quarkus distribution: what does `kc.sh build` do, why `--optimized`, and what goes wrong when an image is built per environment?"

_Answered in [Architecture](Architecture.md)._

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

_Evidence in this repository:_ [`Dockerfile`](../Dockerfile), one image, build-time
options in the build stage, `start --optimized` in the runtime stage; the same image under the
compose file and the smoke test; the runtime options as environment in both.

### Q13. "keycloak-config-cli, the Terraform provider, the Operator's realm import and `kc.sh export`: which owns what, and how do secrets stay out of realm JSON?"

_Answered in [Configuration](Configuration.md)._

`kc.sh export` and `import` are the server's own dump and load: right for learning what a realm
looks like and for a one-time migration, wrong for a pipeline, because they move a whole realm with
the server stopped and know nothing about convergence. The Operator's `KeycloakRealmImport` imports
a realm when the server comes up on Kubernetes and does nothing after; it is a bootstrap, not a
source of truth. keycloak-config-cli is a converger: it reads the representation and makes the
running realm match it, repeatedly, through the admin API, on a laptop or in a cluster alike. The
Terraform provider gives the same resources state, a plan and a diff, and is the right tool where
the set of resources is itself a variable or where Terraform already holds the inputs, a DNS name,
a secret, an identity provider's endpoint.

What keeps them from fighting is one owner per resource, split by resource and never by field.
Kloakware gives the shared realm to config-cli in full and the per-market realms to Terraform; no
client is described twice.

Secrets never enter the JSON. The file carries `$(env:KLOAKWARE_STEWARD_CLIENT_SECRET)`, and
config-cli substitutes it from the environment at apply time, failing if the variable is missing
rather than writing the placeholder. The environment is a mounted secret: the GitHub environment's
secret in the pipeline, a Secrets Manager or Key Vault reference in a deployment. Terraform takes
the same secret as a sensitive variable from `TF_VAR_...`, and its state, which does contain it,
lives in an encrypted backend. A `kc.sh export` of a realm contains hashed credentials and client
secrets; it is handled as a secret and never committed.

_Evidence in this repository:_ the ownership table in this guide; `$(env:...)` in
[`steward.json`](../config/realms/steward.json); `TF_VAR_steward_client_secret` in
[`CheckDrift.sh`](../config/drift/CheckDrift.sh) and the `sensitive` variable in
[`variables.tf`](../config/terraform/variables.tf).

### Q14. "How do you detect configuration drift between Git and a running realm, and fail on it?"

_Answered in [Configuration](Configuration.md)._

Two mechanisms, one per tool. For Terraform, `terraform plan -detailed-exitcode` exits 2 when the
running realm differs from the configuration and 0 when it does not; that exit code is a job's
result, so a pull request fails on drift and a scheduled run pages on it. For config-cli, the
detection is the correction: re-applying the file undoes the difference, so a scheduled re-apply
with the file cache disabled keeps the realm converged, and its log says what it changed. The test
that proves it changes the realm by hand through the admin API, lifetime and PKCE method, re-applies
the unchanged file, and reads the committed values back.

What to do about the console, which is where drift comes from, is a policy question with a technical
answer: in production, nobody holds `manage-realm`; administrators hold view roles and change the
file instead. The exception is incident response, and the first step after an incident is a re-apply.

_Evidence in this repository:_ [`CheckDrift.sh`](../config/drift/CheckDrift.sh) with its three
plans, run by the `drift` job in [`kloakware.yml`](../../.github/workflows/kloakware.yml);
`RealmConvergenceTest`; `IMPORT_CACHE_ENABLED=false` in the compose file, the stack and the promotion
script.

### Q15. "A server-rendered application behind a BFF: confidential client, PKCE anyway, where the tokens live, and what the browser gets."

_Answered in [SignIn](SignIn.md)._

The application has a server, so it is a confidential client with a secret, and the code is
exchanged on that server. PKCE is used regardless, because the realm requires it of every client and
it closes code interception at no cost. The tokens live on the server, and only as long as they are
needed: the ID token is verified and kept on the session row for the end-session hint; the access
and refresh tokens are not kept, because the server calls nothing as the user. The browser gets two
HttpOnly cookies: a ten-minute signed flow cookie during the redirect, and an opaque session id
afterwards. No token, no role, no claim reaches the browser; the session's roles are read from the
row on every request, and the middleware at the edge only checks the cookie's presence, leaving the
verdict to the server-side resolver.

_Evidence in this repository:_ `infra/auth/oidc/OidcClient.ts` and its test for the request and the
exchange; `OidcFlowCookie.ts` for the sealed flow; the callback route setting one opaque cookie; the
resolver refusing a cookie that names no active session.

### Q16. "How do you rotate a realm's signing keys without breaking the applications that verify its tokens?"

_Answered in [SignIn](SignIn.md)._

Add before you remove. A new key provider with a higher priority starts signing; the old key is set
passive, still published in the JWKS so tokens it signed keep verifying, until the longest-lived
token it signed has expired, then it is deleted. Applications that verify locally follow this by
caching the JWKS and refetching, once and rate-limited, when a token names an unknown `kid`; that is
the whole contract, and Steward's provider implements and tests it. The three ways it goes wrong:
a verifier that pinned a single key, a verifier that caches forever, and a verifier with no floor
on refetches, which an attacker turns into a request storm with invented `kid`s. Rehearse the
rotation in staging with the real clients before production, and keep the passive window longer
than the offline-token lifetime if offline tokens exist, which in this realm they do not.

_Evidence in this repository:_ `OidcProvider.ts`, the key cache and its refetch; the rotation case
in `OidcProvider.test.ts`.

### Q17. "Realm roles, client roles, composite roles, groups and attributes: which do you use for what, and what ends up in the token?"

_Answered in [Tokens](Tokens.md)._

Realm roles are the application-wide vocabulary: `steward-approver` means the same thing to every
client in the realm, and Steward's six are realm roles. Client roles belong to one client and are
meaningful only to it: `realm-management`'s `manage-users` is the canonical example, and an
application that has roles no other application should see uses them. Composite roles bundle others
so that one assignment grants a set: the realm's default role is a composite, and `steward-viewer`
sits inside it so every new user lands on the floor. Groups are organisation, not permission: a user
is in `/markets/SE` because they work Sweden, the group carries the `market` attribute and may carry
role mappings, and membership is inherited down the tree. Attributes are facts about the user that
policies and mappers read, declared in the user profile so that only known ones exist.

What reaches the token is a separate decision, made by scopes and mappers, not by the role model.
Full scope off and no `roles` scope: no role reaches it. The `steward` mapper writes the compact
claim: Steward's realm roles, short, and the markets, from the groups and the attribute. Nothing
about client roles, because no client of Steward's reads them; nothing about the group tree, because
"SE" is what the decision needs, not "/markets/SE". The rule: the model is for administrators, the
token is for verifiers, and a mapper is where one becomes the other.

_Evidence in this repository:_ the roles, groups, user profile and scopes in
[`steward.json`](../config/realms/steward.json); `StewardClaim.build` with its tests for the prefix,
the group path and the attribute; the lean token's claims in `TokenShapeTest`.

### Q18. "A Keycloak upgrade breaks a custom SPI. How do you find out before production, and how do you version extensions against Keycloak?"

_Answered in [Extensions](Extensions.md)._

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

### Q19. "LDAP federation: import or no import, read-only or writable, the sync modes, and what users experience when the directory is down."

_Answered in [Federation](Federation.md)._

Import, read-only, changed-users sync, and the directory's users cannot sign in while it is down.

**Import or not.** Import keeps a copy of each user in Keycloak's database, created on their first
sign-in or by a sync. The copy is what Keycloak attaches state to: sessions, consents, required
actions, the identities a broker links, and the realm roles the mappers grant. Without import, every
lookup is a directory query and nothing persists between sign-ins; it suits a directory that is the
only store and changes constantly, and it makes every outage total. A payment operator's directory
changes slowly, so import.

**Read-only or writable.** `READ_ONLY` because the directory is someone else's. `WRITABLE` writes
profile and password changes back, which needs a bind account with write access and a directory
administrator who agreed to that. `UNSYNCED` lets Keycloak's copy diverge from the directory, which
is a migration tool, not a mode to run in.

**Sync modes.** A full sync walks the directory and imports or updates everyone; it is for the first
load or a migration, triggered by hand and measured, because it is as expensive as the directory is
large. A changed-users sync asks for entries modified since the last run and runs on a period; five
minutes keeps copies fresh at a cost the directory does not notice. Both need pagination on a real
directory. Neither is needed for a user to sign in: the first sign-in imports them.

**When the directory is down.** Its users cannot sign in: their passwords are there and nowhere
else, and Keycloak does not cache passwords. After the connect and read timeouts, which the realm
sets to five seconds each, the login page shows an error rather than hanging. Nobody is deleted and
nothing else is affected; realm users, Steward users and brokered users sign in as before, and the
directory's users do again the moment it is back. The test pauses the container and measures each of
those statements.

### Q20. "A brokered sign-in stops at 'account already exists'. What is the first-login flow doing, and how are accounts linked safely?"

_Answered in [Federation](Federation.md)._

It is protecting the existing account from being taken over through the provider.

**What the flow is doing.** The first time an identity arrives from a provider, Keycloak runs the
first broker login flow. It reviews the profile, then tries to create a user. If another user already
has that email or username, the default flow stops with the question: continue by linking this
identity to the existing account, or review the profile and enter a different email. Linking needs
proof that the person owns the existing account: a sign-in to it with its password, or a click on a
link sent to its email. Without that proof, anyone who can get an account at the provider with the
victim's email could sign in as the victim.

**When automatic linking is safe.** When the provider verifies the email itself and is trusted with
it, the proof is redundant: a corporate provider that is the company's source of truth for addresses
is such a provider, and the realm here binds a flow with "Automatically set existing user" to the
corporate providers, with `trustEmail` on them. A social provider, or any provider where a person
can register an arbitrary address, is not, and gets the default flow with its check. The rule is
per provider, which is why the flow is bound per provider.

**What the realm shows.** `erin.corp`, with `erin.example`'s email, signs in through the corporate
provider and lands as `erin.example`: one account with that email, the corporate identity linked to
it, and the role Corp states, since the mappers sync on every sign-in. `carl.corp`, with a new email, becomes a new account with the
market and the role the provider states. The test drives both as a browser.

### Q21. "Persistent user sessions arrived in 26. What changed about Infinispan sizing, restarts and sticky sessions?"

_Answered in [Clustering](Clustering.md)._

Sessions moved into the database, and three operational facts followed.

**Restarts** no longer sign anyone out: a node or the whole cluster can restart and every session is
read back from its row as it is used. **Sizing** is for the active set, not the population: the
session caches are capped by `cache-embedded-sessions-max-count` and its siblings, with the database
behind them, where before the heap had to hold every session, offline ones included. **Sticky
sessions** are no longer needed for signed-in users, since any node reads the row; during the login
itself the authentication session lives in a distributed cache with two owners, so any node can
serve any step, and the route the `AUTH_SESSION_ID` cookie carries is an optimisation a proxy may use
or ignore. The test signs in on one node, stops it, and refreshes on the other.

### Q22. "Operator, Helm chart or plain manifests, and how do you keep an AWS and an Azure deployment of the same service equivalent?"

_Answered in [Deployment](Deployment.md)._

The Operator, and equivalence by contract: one module that runs on both clouds and two platform
modules that owe it the same outputs.

**Operator, chart or manifests.** The Keycloak Operator knows things a chart cannot: it orders a
rolling update so one node migrates the schema first, exposes the scale subresource an autoscaler
targets, writes the network policy for its own pods, and turns `instances`, `db`, `hostname`,
`ingress` and `additionalOptions` into a StatefulSet, Services and an Ingress that match the
server's version, since the Operator is released with it. A Helm chart reproduces the manifests and
none of the operational knowledge; plain manifests reproduce them by hand. The Operator's own
manifests are plain enough: vendored at 26.8.0 with checksums and applied by Terraform, so the
Operator and the image move together.

**Equivalence.** The kloakware module takes an object: the database, the administrator, how an
Ingress is reached, what to wait for. The AWS platform fills it from Aurora, Secrets Manager, ACM
and the load balancer controller; the Azure platform from Flexible Server, Key Vault, cert-manager
and the application routing add-on. What differs is inside the platform modules and the two
annotation sets they output; what the Operator deploys is the same resource from the same file. The
one `cloud` variable selects the platform, the state stays in one place, and the check job validates
both platforms on every pull request whether or not an environment runs on Azure, so the switch
cannot rot unnoticed.

### Q23. "Multi-region: active-active or active-passive, and what does the database force on that choice?"

_Answered in [Deployment](Deployment.md)._

Active-passive, because the database is one and Keycloak's own guidance stops at one region.

Keycloak's state is the database first and Infinispan second. Within a region, two availability
zones and a multi-AZ database give the active-active that matters: a zone can go and sessions,
realms and users are in the rows the other zone reads, with the multi-site feature replicating the
caches between the two clusters. Across regions the database decides: Aurora Global Database and
Azure's cross-region replicas replicate asynchronously, with one writer region, so a second active
region would either write to a remote primary at cross-region latency on every session change,
which persistent user sessions make frequent, or write to its own replica, which it cannot. The
honest shape is a primary region at the production tier and a second region that holds a replica of
the database, promotes it when the primary is gone, and starts kloakware from the same Terraform
with the promoted endpoint: active-passive, with the time to promote and start as the recovery
time, and the replication lag as the recovery point. Cross-region active-active is outside the
tested envelope, and the Clustering guide says why.

### Q24. "What is the rollback story for a minor upgrade whose schema migration has already run?"

_Answered in [Upgrades](Upgrades.md)._

Restore the snapshot and start the old image; Keycloak has no down-migrations.

The schema a minor leaves behind is one the old version does not know, so the old image cannot
start on it. The rollback is the snapshot taken before the migration, restored over the database,
and the old image started on it; the rehearsal does it and checks the version and a sign-in. The
cost is what happened in between: sessions created since the snapshot are rows that are gone, so
those users sign in again, and any change made to the realm by hand is gone too, which the pipeline
makes a non-event because there are none. The snapshot is kept until the new version has outlived
the longest session, after which rolling back would sign out more people than the upgrade did. A
patch is the easy case: no migration, so the old image rolls forward again without a snapshot.

### Q25. "How do you size a deployment for a login rate, and which number tells you first that you got it wrong?"

_Answered in [Observability](Observability.md)._

Size from the cost of one login, measured, and watch the pool's wait time.

A login is one argon2 verification, a few database round trips and a handful of cache writes, and
the first two set the size. The argon2 cost is fixed by the realm's hashing policy and is CPU: the
repository's load runs sign-ins at a rate that climbs until a number leaves the floor, and the
stage where it does, with CPU and the hash counter beside it, gives logins a second a node can take.
Nodes come from the target rate divided by that, plus one for a roll. The database pool is the
other bound: every request holds a connection, so the pool times the inverse of a request's
duration is the request rate a node can serve, and the database's connection limit divided by the
pool is the number of nodes it can serve; the Operator's `poolMaxSize` and the database's size are
set together. Memory follows the session caches, which are capped by the `cache-embedded-*-max-count`
options and backed by the database since 26, so the heap is sized for the active set.

The number that says the sizing was wrong depends on which bound is hit first, and the dashboard
carries both. Where the database is the far side, the pool's average wait for a connection rises
while CPU is still fine and before the p95 does, because queuing for a connection is the first
thing that happens when a node has more requests than it can hold at once; the alert sits on it at
100 ms for five minutes. Where the hashing is the bound, as on the laptop stack measured above, the
pool never waits and the token endpoint's p95 is the first to move, by two orders of magnitude in
one stage, with the hash counter flattening beside it. Pool wait rising with CPU low means the pool
or the database is short; the p95 rising with the pool idle means the hashing bound, and the nodes
are short.

### Q26. "DPoP versus mTLS-bound tokens: what each protects against, and when you pick which."

_Answered in [Security](Security.md)._

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

_Answered in [Security](Security.md)._

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
