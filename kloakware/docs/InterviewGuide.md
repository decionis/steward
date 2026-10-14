# The interview guide

Everything the walkthrough built, in the order an interview goes through it: a one-page summary of
what exists and where, the strategy comparison from the brief with the step that evidences each
senior-column claim, every question from Q1 to Q27 with its answer in one sentence and the file that
proves it, a sixty-second story per topic, and a mock interview. The full answers live in
[InterviewQuestions.md](InterviewQuestions.md), generated from the guides; this guide is the map,
not a second copy. The plan is [docs/Kloakware.md](../../docs/Kloakware.md).

## One page: what was built

Kloakware is Keycloak 26.8 as the access service operators sign in to Steward through: a Java
project under `kloakware/` with its own image, realm configuration, deployment and tests, built in
twelve pull requests, one per concept.

| Step | What exists                                                                                                                                                                                                             | Pull request                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| K0   | The plan, the decisions K-D1 to K-D9, the boundary documents                                                                                                                                                            | [#124](https://github.com/decionis/steward/pull/124) |
| K1   | The image: Keycloak pinned by digest, build-time options compiled in, `start --optimized`; the realm's first shape; the compose stack; the container tests                                                              | [#126](https://github.com/decionis/steward/pull/126) |
| K2   | The realm as code: keycloak-config-cli converging the file, the Terraform provider for the market realms, drift detected and undone, the promotion script and workflow                                                  | [#127](https://github.com/decionis/steward/pull/127) |
| K3   | Steward signing in: the code flow with PKCE from the server, the ID token verified, a server-side session behind one opaque cookie, backchannel logout, the end-to-end run                                              | [#128](https://github.com/decionis/steward/pull/128) |
| K4   | Token design: a custom protocol mapper writing one compact claim, the lightweight access token, Authorization Services on the resource server, sizes measured                                                           | [#129](https://github.com/decionis/steward/pull/129) |
| K5   | The Java extensions: the audit event listener with its sinks, the market second factor (BankID), the legacy password hash                                                                                               | [#130](https://github.com/decionis/steward/pull/130) |
| K6   | Federation and brokering: LDAP read-only with import, Steward's users table as a user storage provider, OIDC and SAML brokers with a first-login flow that links safely                                                 | [#131](https://github.com/decionis/steward/pull/131) |
| K7   | The cluster: two nodes behind HAProxy, jdbc-ping discovery, persistent sessions, a node stopped under a session                                                                                                         | [#132](https://github.com/decionis/steward/pull/132) |
| K8   | Terraform to AWS with the Azure switch: a platform module per cloud with one output contract, the Operator, environments dev to prod, OIDC-federated CI                                                                 | [#133](https://github.com/decionis/steward/pull/133) |
| K9   | Zero-downtime upgrades rehearsed: a patch rolled under load with zero failed requests, a minor with the schema migrated, the manual SQL path, the rollback                                                              | [#134](https://github.com/decionis/steward/pull/134) |
| K10  | Observability: metrics, health, tracing and JSON logs; Prometheus, Grafana and a collector in the stack; seven alerts with reasons; the load that finds the first bottleneck                                            | [#135](https://github.com/decionis/steward/pull/135) |
| K11  | Financial-grade hardening: the FAPI 2 profiles bound to two clients, mutual TLS at a terminator, DPoP, the revocation runbook as a test, edge rate limits, passkeys, a least-privilege service account for the pipeline | [#136](https://github.com/decionis/steward/pull/136) |
| K12  | This guide                                                                                                                                                                                                              |                                                      |

The numbers worth remembering: the access token lives 300 seconds; the lean token is 930 bytes and
10 claims against 1462 and 21; the patch roll served 2646 requests with none failed; the laptop's two
nodes take about 70 sign-ins a second before the argon2 bound shows; the suite is 19 unit tests and
49 container tests, every one of them a sentence in the guides.

## The strategy comparison, evidenced

The brief's table, with a column the brief did not have: where the senior column is proven.

| Focus area    | Junior or mid-level view                        | Senior consultant view                                     | Evidenced by                                                                                                                                                                                   |
| ------------- | ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration | Uses the Admin UI to create users and roles.    | Uses Terraform, GitOps and keycloak-config-cli.            | K2: `config/realms/steward.json` converged by config-cli, `config/terraform/` for the market realms, `CheckDrift.sh` failing a pull request on drift, `ApplyRealm.sh` promoting by tag         |
| Customization | Relies on built-in features and themes.         | Writes custom Java SPIs for authentication and events.     | K4 to K6: `extensions/` with the claim mapper, the event listener, the market second factor, the legacy hash and the user storage, each with a unit test and a container test                  |
| Scalability   | Runs a single instance connected to a DB.       | Configures Infinispan clustering and Kubernetes Operators. | K7 and K8: two nodes behind HAProxy discovered through jdbc-ping, `ClusterTest` stopping a node under a session; the Operator deployed by Terraform on EKS or AKS                              |
| Token design  | Dumps all roles and data directly into the JWT. | Uses token optimization, the userinfo endpoint and ABAC.   | K4: full scope off, one compact claim from `StewardClaimMapper`, the lightweight token measured in `TokenShapeTest`, Authorization Services deciding per market in `AuthorizationServicesTest` |

Four rows the walkthrough added, because the interview will:

| Focus area | Junior or mid-level view                                      | Senior consultant view                                                                              | Evidenced by                                                                                     |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sign-in    | Tokens in the browser, roles read from the JWT on the client. | A confidential client behind the server, PKCE anyway, one opaque cookie, backchannel logout.        | K3: `infra/auth/oidc/`, the session row, `test/e2e/KloakwareSignIn.test.mjs`                     |
| Upgrades   | Bumps the image and hopes.                                    | Rehearses the roll under load, snapshots before a minor, hands the SQL to a DBA, has a rollback.    | K9: `upgrade/Rehearse.sh` and the weekly workflow                                                |
| Operations | Watches CPU.                                                  | Watches the pool's wait time and the token endpoint's p95 first, with the reason for every alert.   | K10: `observability/alerts.yml`, the dashboard, `FindTheKnee.sh`                                 |
| Security   | A client secret and HTTPS.                                    | The FAPI 2 profile where money moves, sender-constrained tokens, a revocation runbook that was run. | K11: the client policies, the terminator, `FinancialGradeTest`, `RevocationTest`, `kloakware-ci` |

## Every question, in one line

The question as asked, the answer's spine, and the file to open. The brief's ten first.

| Q   | Asked                                                      | The answer in one sentence                                                                                                                                                                       | Proof                                                                               | Guide                                                      |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Q1  | Ten countries, some shared profiles, some strict isolation | Shared profiles mean one realm with markets as groups; isolation is about where data rests, so those markets are deployments from the same template, brokered for the few who cross.             | `config/realms/steward.json`, decision K-D3                                         | [Architecture](Architecture.md)                            |
| Q2  | Infinispan across instances; lag and split-brain           | Local caches invalidated, distributed caches with two owners, sessions in the database since 26, jdbc-ping discovery, one region per cluster; a partition loses only what memory held.           | `ClusterTest`, `deploy/compose/haproxy/`                                            | [Clustering](Clustering.md)                                |
| Q3  | Schema migrations in a cluster without downtime            | Liquibase migrates once under its lock from the first new node; a patch rolls, a minor stops the cluster for the migration's measured duration, the manual strategy hands the SQL to a DBA.      | `upgrade/Rehearse.sh`                                                               | [Upgrades](Upgrades.md)                                    |
| Q4  | Securing financial transactions; FAPI, mTLS                | The FAPI 2 profile where the money moves: `private_key_jwt`, PAR, PKCE, PS256, and the token bound to a certificate or a DPoP key, with the refusals tested.                                     | the client policies in `steward.json`, `deploy/compose/mtls/`, `FinancialGradeTest` | [Security](Security.md)                                    |
| Q5  | A compromised token across microservices                   | Never rely on revoking the token: five-minute tokens, rotating refresh tokens, the session as the kill switch, backchannel logout, introspection before the operations that cannot wait.         | `RevocationTest`, `app/api/auth/oidc/backchannel-logout/`                           | [SignIn](SignIn.md), [Security](Security.md)               |
| Q6  | Token bloat with hundreds of roles                         | Do not put roles in the token: full scope off, one compact claim from a mapper, the lightweight token, and a policy engine joining role kinds and markets per request.                           | `TokenShapeTest`, `StewardClaimMapper`                                              | [Tokens](Tokens.md)                                        |
| Q7  | A custom SPI: use case, test, deployment                   | The audit listener: an `EventListenerProvider` with an async outlet to signed sinks, unit tests on vectors, a container test against the real server, the JAR compiled into the image.           | `extensions/event-listener`, `AuditTrailTest`                                       | [Extensions](Extensions.md)                                |
| Q8  | A legacy hashing algorithm during migration                | A `PasswordHashProvider` that verifies the old hash and never claims the policy is met, so the first sign-in rehashes to argon2 in the same request.                                             | `extensions/password-hash-legacy`, `LegacyPasswordTest`                             | [Extensions](Extensions.md)                                |
| Q9  | Environment consistency; the realm pipeline                | One file, one image: config-cli converges every environment to the committed realm, a tag promotes through dev, QA, staging and production behind reviewers, drift fails the pull request.       | `ApplyRealm.sh`, `kloakware-promote.yml`, `RealmConvergenceTest`                    | [Configuration](Configuration.md), [Upgrades](Upgrades.md) |
| Q10 | Metrics that catch bottlenecks early                       | The pool's wait time first, the token endpoint's p95 second, hashes a second and CPU for the argon2 bound, GC and heap for the caches, cluster size, and the event metrics for what the load is. | `observability/alerts.yml`, `ObservabilityTest`                                     | [Observability](Observability.md)                          |
| Q11 | Organizations as the tenant boundary                       | An organisation is the right boundary for customers who bring their own identity into one product; it gives no isolation of data, policy, administrators or jurisdiction.                        | the comparison table in Architecture, K-D3                                          | [Architecture](Architecture.md)                            |
| Q12 | Build-time versus runtime options                          | `kc.sh build` compiles the decisions in and `start --optimized` boots in seconds; an image per environment diverges the bytes and turns configuration into a release.                            | `Dockerfile`                                                                        | [Architecture](Architecture.md)                            |
| Q13 | config-cli, Terraform, the Operator import, `kc.sh export` | One owner per resource: config-cli converges the shared realm, Terraform owns the market realms, the Operator import bootstraps, export is a dump; secrets are `$(env:...)` at apply time.       | `steward.json`, `config/terraform/variables.tf`                                     | [Configuration](Configuration.md)                          |
| Q14 | Detecting drift and failing on it                          | `terraform plan -detailed-exitcode` for Terraform's realms, re-apply for config-cli's, nobody holds `manage-realm` in production.                                                                | `CheckDrift.sh`, `RealmConvergenceTest`                                             | [Configuration](Configuration.md)                          |
| Q15 | A server-rendered app behind a BFF                         | Confidential client, PKCE regardless, tokens on the server only as long as needed, the browser gets a flow cookie and an opaque session id.                                                      | `OidcClient.ts`, `OidcFlowCookie.ts`                                                | [SignIn](SignIn.md)                                        |
| Q16 | Rotating signing keys without breaking verifiers           | Add before you remove: a new key at higher priority, the old one passive and published until its last token expires; verifiers cache the JWKS and refetch once on an unknown `kid`.              | `OidcProvider.ts` and its test                                                      | [SignIn](SignIn.md)                                        |
| Q17 | Realm roles, client roles, composites, groups, attributes  | Realm roles are the vocabulary, client roles belong to one client, composites bundle, groups organise, attributes are facts; a mapper decides what reaches the token.                            | `steward.json`, `StewardClaim` tests                                                | [Tokens](Tokens.md)                                        |
| Q18 | An upgrade breaks a custom SPI                             | One `keycloak.version` the image pin moves with, so the build of the bump fails first, the container tests second, the rehearsal third; stay on the public SPI.                                  | `pom.xml`, the `verify (java 21)` job                                               | [Extensions](Extensions.md)                                |
| Q19 | LDAP: import, read-only, sync, outage                      | Import, read-only, changed-users sync; the directory's users cannot sign in while it is down and everyone else can, which the test measures with the container paused.                           | `LdapFederationTest`, `deploy/compose/ldap/`                                        | [Federation](Federation.md)                                |
| Q20 | "Account already exists" on a brokered sign-in             | The first-login flow protecting an existing account from takeover; automatic linking only for a provider trusted with the email, bound per provider.                                             | `BrokeredSignInTest`, the `steward first broker login` flow                         | [Federation](Federation.md)                                |
| Q21 | Persistent user sessions in 26                             | Restarts sign nobody out, caches are sized for the active set, sticky sessions are an optimisation a proxy may ignore.                                                                           | `ClusterTest`                                                                       | [Clustering](Clustering.md)                                |
| Q22 | Operator, chart or manifests; AWS and Azure equivalent     | The Operator, for what it knows about rolling and scaling; equivalence by contract between two platform modules and one kloakware module, both validated on every pull request.                  | `deploy/terraform/modules/`                                                         | [Deployment](Deployment.md)                                |
| Q23 | Multi-region                                               | Active-passive, because the database has one writer region and Keycloak's guidance stops at one region; the second region holds a replica and the same Terraform.                                | the Deployment guide's cost and region tables                                       | [Deployment](Deployment.md)                                |
| Q24 | Rollback after a minor's migration                         | Restore the snapshot and start the old image; the cost is the sessions created since, and the snapshot is kept until the new version outlives the longest session.                               | `upgrade/Rehearse.sh`, the rollback step                                            | [Upgrades](Upgrades.md)                                    |
| Q25 | Sizing for a login rate                                    | Size from the measured cost of one login, argon2 and the pool; the pool's wait time says the database is short, the p95 rising with the pool idle says the nodes are.                            | `observability/FindTheKnee.sh`                                                      | [Observability](Observability.md)                          |
| Q26 | DPoP versus mTLS-bound tokens                              | Both make a stolen token inert; mTLS proves in the transport and needs a PKI and a proxy that passes certificates, DPoP proves per request and crosses any ingress.                              | `steward-fapi` and `steward-fapi-dpop`, `FinancialGradeTest`                        | [Security](Security.md)                                    |
| Q27 | Least-privilege admin API and service accounts             | Never automate as the administrator: a master-realm service account with the managed realms' roles and nothing of master's, one account per automation, admin events on.                         | `config/realms/master.json`, `ServiceAccountAdminTest`                              | [Security](Security.md)                                    |

## Sixty seconds per topic

Each story is what to say when the interviewer opens a topic and lets you talk; the question table
above is for when they interrupt.

**Architecture.** One realm is the default, with markets as groups and an attribute in the token,
because shared profiles are single sign-on and single sign-on is one issuer. A realm never moves
data, so a market with residency law is a deployment, from the same template, in its region.
Organizations are for customers who bring their own identity into one product, not for isolation.
The image is built once with its build-time options compiled in and started `--optimized`
everywhere; what differs per environment is a runtime option, never a build.

**Configuration.** The realm is a file in Git and a tool converges the running realm to it, so
consistency is a property of the pipeline rather than of discipline. Secrets are substituted at
apply time and never written. A pull request applies the file to a fresh server, signs in through
it, changes something by hand and watches the next apply undo it. A tag promotes the same file
through four environments behind their reviewers. Terraform owns the resources whose count is a
variable, the market realms, and config-cli owns the shared realm; nothing has two owners.

**Sign-in.** Steward is a confidential client behind its own server: the code flow with PKCE, the
exchange on the server, the ID token verified against the published keys with the JWKS cached and
refetched once on an unknown key. The browser gets one opaque session cookie and never a token. The
session is a row, so ending it is one write, and the issuer's backchannel logout ends it from
anywhere. Keys rotate by adding a key before removing one.

**Tokens.** Roles do not belong in the token. Full scope off, a custom mapper writes one compact
claim, roles without prefix and composites resolved, plus the markets; the lightweight token leaves
the profile to userinfo. Measured: 930 bytes and 10 claims instead of 1462 and 21. Where the
decision needs more than a role, the resource server asks Authorization Services, which joins the
role kinds and the markets per request.

**Extensions.** Three SPIs, each the smallest thing that does the job: an event listener that hands
every event to an asynchronous outlet with signed sinks, so no request thread ever waits on a
receiver; a market-conditioned authenticator that adds BankID for the Swedish market; a password
hash provider that verifies a legacy hash and lets the first sign-in rehash it. Every extension is
compiled against one Keycloak version that the image pin moves with, so a breaking bump fails the
build of the pull request that bumps it, and the container tests run it against the real server.

**Federation.** LDAP with import and read-only, synced for changes, because the directory is
someone else's and changes slowly. Steward's own users table as a user storage provider with import
on first sign-in. OIDC and SAML brokers to the corporate provider, with a first-login flow that
links to an existing account automatically only because that provider is trusted with the email,
and the default review flow for any provider that is not. The test drives each as a browser and
pauses the directory to measure what its users experience.

**Clustering.** Two nodes behind a proxy, one address, because a node names the issuer after the
host it was reached on. Discovery through a table in the shared database, jdbc-ping, the one
mechanism that needs nothing the nodes do not already share. Sessions in the database since 26, so
a restart signs nobody out and the caches are sized for the active set. One cluster per region; a
partition loses only what memory held. The test stops a node under a session and refreshes on the
other.

**Deployment.** The Operator, because it knows how to roll a version that migrates the schema and
exposes what an autoscaler targets. One kloakware module that takes an object, two platform modules
that fill it, AWS from Aurora, Secrets Manager and the load balancer controller, Azure from Flexible
Server, Key Vault and the routing add-on; a `cloud` variable chooses, and the check job validates
both every time. Active-passive across regions, because the database has one writer.

**Upgrades.** A patch migrates nothing and rolls one node at a time, drained before it stops, under
a login load that fails the rehearsal on one failed request. A minor migrates, so the cluster stops
for the migration's measured duration, with a snapshot before it and the SQL exportable for a DBA.
Rollback is the snapshot and the old image, because there are no down-migrations. All of it runs on
every pull request that moves the pin and weekly from the release before.

**Observability.** The pool's wait time moves first, the token endpoint's p95 second, then the hash
rate and CPU for the argon2 bound; event metrics tagged by realm, client and provider say what the
load is made of, and exemplars lead to the trace. Seven alerts, each with its reason as an
annotation. A load that climbs in stages found the laptop's knee at about 70 sign-ins a second with
the pool idle, so the bound was the hashing, and the answer is nodes, not connections.

**Security.** Keycloak ships the FAPI 2 profiles; the work is binding them with a client policy to
the clients that move money: `private_key_jwt` through a registered certificate, pushed
authorisation requests, PS256, and the token bound to the client certificate the terminator
verified or to a DPoP key the client proves. The plain entry strips the certificate header so it
cannot be forged. The revocation runbook was run as a test, step by step; the edge limits the token
endpoint and the login post per source; passkeys sit beside the OTP; and the pipeline signs in as a
service account that can manage two realms and nothing of master's.

## A mock interview

Eight exchanges in the order an interviewer tends to take, each with the likely follow-up. The
answers are compressed; the full ones are in the guides.

**Interviewer: Ten markets, some share users and some must not. How do you lay it out?**
One realm for the markets that share profiles, with the market as a group and a claim, because
sharing profiles is single sign-on and that is one issuer. The markets with residency law are
separate deployments from the same realm template, each with its database in its region, and
the people who cross borders are brokered between issuers.
_Follow-up: why not a realm per market?_ A realm is a namespace in one database; it isolates
configuration, not data. It would cost a copy of every client and flow per market and give the
isolated markets nothing the law asked for.

**Interviewer: How do you keep dev, staging and production the same?**
One file and one image. The realm is JSON in Git, converged by keycloak-config-cli; what differs is
substituted from the environment at apply time. A pull request proves the file applies and a hand
change is undone; a tag promotes it through the environments behind reviewers.
_Follow-up: and the console?_ In production nobody holds `manage-realm`. The exception is an
incident, and the first step after one is a re-apply.

**Interviewer: A user has hundreds of roles. What is in the token?**
Not the roles. Full scope off, no `roles` scope, a mapper writes one compact claim with the role
kinds and the markets, and the lightweight token keeps the profile out. Where the decision needs
the join of role and market, the resource server asks Authorization Services per request.
_Follow-up: numbers?_ 930 bytes and 10 claims for the same user who had 1462 and 21.

**Interviewer: Walk me through an SPI you wrote.**
An event listener for the audit trail. The provider turns each event into a signed record and
offers it to a bounded queue drained by one thread to the sinks, so a slow receiver cannot slow a
sign-in. Unit tests on the record and its signature, a container test that signs a user in against
the real server and reads the record at a receiver, the end-to-end run that reads it from Steward's
database. The JAR is compiled into the image by the Dockerfile's Maven stage.
_Follow-up: what broke?_ The Java client's default h2c upgrade, which Next.js answers by closing
the connection; only the real end-to-end run saw it. Pinned to HTTP/1.1.

**Interviewer: A token is stolen. What happens?**
If it is a FAPI client's token, nothing: it is bound to a certificate or a DPoP key the thief does
not have. Otherwise the access token is five minutes old at most, the refresh token rotates with
reuse detection, and the session is the kill switch: ending it at the issuer sends a backchannel
logout to Steward and makes introspection answer inactive at once. The operations that cannot wait
five minutes introspect first.
_Follow-up: across many services?_ The gateway verifies signatures and the not-before locally and
introspects where it must; services trust the gateway; nothing is told about one token.

**Interviewer: How do you upgrade a cluster with a schema change?**
Know which updates migrate. A patch does not and rolls one node at a time under load; a minor does,
so the cluster stops, the first new node migrates under Liquibase's lock, the rest join. Snapshot
before, the SQL exportable for a DBA, the duration measured on a copy of production first.
_Follow-up: rollback after the migration ran?_ The snapshot and the old image. There are no
down-migrations, and the cost is the sessions created since the snapshot.

**Interviewer: What do you watch in production?**
The database pool's wait time first; it rises before latency and before CPU. The token endpoint's
p95 second. Hashes a second and CPU for the argon2 ceiling. GC and heap for the caches, the cluster
size for the membership, and the event metrics for what users are doing.
_Follow-up: how did you size it?_ A load that climbs until a number leaves the floor; on two nodes
the knee was about 70 sign-ins a second with the pool idle, which says hashing, which says nodes.

**Interviewer: FAPI or mutual TLS for the payment flows?**
Both, where the money moves. The FAPI 2 profile: a signed client assertion, pushed requests, PKCE,
PS256, and sender-constrained tokens. Mutual TLS binds the token to a certificate and needs a PKI
and a proxy that passes it; DPoP binds it to a key the client proves and crosses any ingress. The
profile is Keycloak's; the policy that binds it to the right clients, the terminator, and the tests
of every refusal are ours.
_Follow-up: who runs the pipeline's admin calls?_ A service account in the master realm with the
two realms' management roles and nothing else; the administrator created it once and went back in
the vault.

## Where to look while talking

- The realm, in one file: [`config/realms/steward.json`](../config/realms/steward.json).
- The image: [`Dockerfile`](../Dockerfile).
- The extensions: [`extensions/`](../extensions/).
- The stack on a laptop: [`deploy/compose/`](../deploy/compose/).
- The platforms: [`deploy/terraform/`](../deploy/terraform/).
- The tests, one per claim: `smoke/src/test/java/com/decionis/kloakware/smoke/`.
- The answers in full: [InterviewQuestions.md](InterviewQuestions.md).
