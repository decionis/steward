# Kloakware: Keycloak as the access service for Steward

**Status: decided 13 October 2026; the decisions below are taken; implementation begins with K0 and K1.** Kloakware is the access
service operators sign in to Steward through: a Keycloak distribution the operator runs, extended in
Java where Keycloak's defaults stop, configured from Git rather than from the Admin UI, and deployed
to AWS by Terraform with a switch to Azure. Each workstream below is one pull request off `master`,
and each pull request carries three things: the code, a guide to the Keycloak concept it exercises,
and the written answers to the interview questions that concept is examined on. The guides and the
answers are deliverables, not commentary; the code is the evidence behind them.

Two assumptions this plan is written under, confirmed with the decisions:

- **"Written in Java" means kloakware.** Keycloak is a Java server and its extensions, the Service
  Provider Interfaces, are Java; that is where the Java lives. Steward stays what it is, a Next.js
  application in TypeScript, and gains an OpenID Connect client that signs in through kloakware.
- **Kloakware lives in this repository**, under `kloakware/`, as a self-contained Maven project with
  its own configuration, deployment and docs directories, so every step is a pull request here and
  the service can be lifted into its own repository later without rewriting anything. Decision K-D1.

## The decision

Steward's own accounts were decided on 25 September 2026 in [docs/Persistence.md](./Persistence.md):
local email-and-password accounts beside the Decionis sign-in handoff, with the organisation
choosing which methods are enabled (P3), and a user able to carry an SSO subject instead of a
password. Kloakware is the third method, and for an operator with a directory, a corporate identity
provider, market-specific multi-factor rules or a legacy user store, it is the one they will use:

- The operator runs kloakware beside Steward, on their own hosting, as they run Steward itself.
- Steward signs users in through it with the Authorization Code flow and PKCE, verifies the ID token
  against the issuer's published keys, creates or updates the user in its own `users` table by SSO
  subject, and keeps a server-side session in its own `sessions` table behind an HttpOnly cookie.
  The browser never holds an access token.
- Steward's roles are assigned in kloakware as realm roles and read from the token; markets are
  groups and a user attribute. Two roles join the four Steward has today. `OPERATIONS` is the
  technical team that runs Steward for the operator: it manages signal sources and collections, the
  workspace connection and the database status, and records no review. `AUDITS` reads every record
  Steward keeps, activities, reviews, decisions and collections, and changes nothing. Enforcement
  stays where it is, in `application/`, and the platform still re-authorises every write with the
  org API key.
- Kloakware is extended in Java where an enterprise needs it: an audit event listener, a
  market-aware authentication step, a legacy password hash for migration, and Steward's own user
  table as a federated store.
- Every realm, client, role, flow and policy is configuration in Git, applied by
  keycloak-config-cli and the Keycloak Terraform provider, promoted through dev, QA, staging and
  production by the same pipeline, with drift failing the build.
- It runs clustered, on Kubernetes through the Keycloak Operator, on EKS by default and on AKS by a
  variable, with Infinispan discovery through the database, persistent sessions, metrics, health
  probes and a rehearsed zero-downtime upgrade.

Kloakware is free and open source like the rest of this repository. It is the operator's identity
for Steward. It is not the Decionis platform's identity: the platform's tenant identity, its sign-in
handoff, its organisation scope and its SSO and SCIM stay in the platform, as
[OpenCore.md](../OpenCore.md) says, and a kloakware session never reaches the platform. What reaches
the platform is what reaches it today: Steward's server, presenting the org API key, naming the
actor.

## What changes, and what does not

| Changes                                                                                                                                              | Does not change                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A third sign-in method on `/sign-in`: through the operator's kloakware                                                                               | The Decionis handoff and local accounts (P3 of the persistence plan)                                                   |
| Two roles join Steward's four: `OPERATIONS` for the technical team, `AUDITS` for read-only access to every record                                    | `VIEWER`, `OPERATOR`, `APPROVER` and `ADMIN` keep their meaning and their gates                                        |
| Steward sets one cookie of its own, `steward_session`, an opaque id into `sessions`                                                                  | Steward never holds a kloakware access or refresh token in the browser                                                 |
| `middleware.ts` accepts a Steward session in live mode as well as the Decionis cookies                                                               | The `VIEWER` floor, the role parsing, the 401-vs-redirect behaviour, the health-probe exemption                        |
| A new trust boundary in [ThreatModel.md](../ThreatModel.md): Steward's server to the token issuer                                                    | Policy, execution, dossiers and the audit record stay in the platform; roles still gate the interface only             |
| A Maven project, a container image, Terraform and a CI workflow under `kloakware/`, path-filtered so `pnpm verify` is untouched                      | The Steward image, its release pipeline and its deployment guide                                                       |
| Keycloak (Apache-2.0), keycloak-config-cli (Apache-2.0), the `keycloak/keycloak` Terraform provider (Apache-2.0), `jose` (MIT) join the dependencies | The license policy: every addition is inside it; Java dependencies get the same allowlist check through a Maven plugin |

## The shape of kloakware

```text
kloakware/
  pom.xml                          parent: Java 21, Keycloak version pinned once, license check
  server/                          the image: Keycloak + providers, built with `kc.sh build`, start --optimized
  extensions/
    event-listener/                EventListener SPI: audit events to stdout, to Steward, optionally to Kafka
    authenticator-market-mfa/      Authenticator SPI: a market-aware second factor, BankID-shaped
    password-hash-legacy/          PasswordHashProvider SPI: a legacy algorithm, rehashed on first sign-in
    user-storage-steward/          UserStorageProvider SPI: Steward's `users` table as a federated store
    token-mapper-market/           ProtocolMapper SPI: the market claim and compacted roles
  config/
    realms/                        keycloak-config-cli JSON, one realm, variables per environment
    terraform/                     the Keycloak provider: clients, redirect URIs, secrets per environment
  deploy/
    compose/                       local: PostgreSQL, two kloakware nodes, config-cli, an LDAP, a broker realm
    terraform/
      modules/platform-aws/        VPC, EKS, Aurora PostgreSQL, Secrets Manager, Route 53, ACM
      modules/platform-azure/      VNet, AKS, Azure Database for PostgreSQL, Key Vault, Azure DNS
      modules/kloakware/           cloud-agnostic: the Operator, the Keycloak CR, realm import, HPA, PDB, monitoring
      environments/{dev,qa,staging,prod}/   `cloud = "aws" | "azure"`, one state each
  docs/                            the guides, one per concept, each ending in its interview questions
```

Keycloak's current line is 26.8 (released 1 October 2026); there is no long-term-support line,
only the newest version receives fixes, so the version is pinned in one place, by digest in the image, and moved by
Dependabot like every other base image here (K-D8). The image is built once and promoted; what
differs between environments is runtime configuration and realm variables, never the bytes.

## How Steward signs in through kloakware

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as Steward server (BFF)
  participant K as kloakware (Keycloak)
  B->>S: GET /sign-in → "Sign in with your organisation account"
  S->>B: 302 to kloakware /auth (code + PKCE S256, state, nonce)
  B->>K: sign in: password, directory, broker, market MFA step
  K->>B: 302 to /api/auth/oidc/callback?code&state
  B->>S: GET /api/auth/oidc/callback
  S->>K: POST /token (code, verifier, client secret)
  K->>S: ID token + access token (5 min) + refresh token (rotated)
  S->>S: verify ID token (issuer, audience, nonce, JWKS); upsert user by sso_subject; map roles; insert session
  S->>B: Set-Cookie steward_session (HttpOnly, Secure, SameSite=Lax); 302 returnTo
  K-->>S: POST /api/auth/oidc/backchannel-logout (logout_token) when the kloakware session ends
  S->>S: revoke every session for that sid or subject
```

- **Confidential client, PKCE anyway.** Steward is a server-rendered application with a BFF, so the
  client is confidential (a secret in a mounted environment variable; `private_key_jwt` arrives with
  the financial-grade profile in K11), and PKCE is still mandated by the realm: it costs nothing and
  closes code injection on the redirect.
- **Tokens stay on the server, and are short.** The access token is five minutes, refresh tokens
  rotate with reuse detection, the SSO session idles out at thirty minutes and ends at ten hours.
  Steward keeps nothing of them past the callback except what it needs to log out; the browser gets
  one opaque session id.
- **Who the user is in Steward** is decided by the token's realm roles, mapped `steward-viewer`,
  `steward-operator`, `steward-approver`, `steward-admin`, `steward-operations` and `steward-audits`
  onto Steward's six, with the same `VIEWER` floor as today. The org scope is the configured Decionis workspace (environment, then the
  `workspaces` row), never a claim from the token.
- **Logout is instant in both directions.** Steward's sign-out ends its session and redirects to
  kloakware's end-session endpoint; kloakware's logout, from any application or the admin console,
  reaches Steward's backchannel endpoint and revokes the sessions for that subject.
- **The dependency.** DB2 of the persistence plan (local accounts, the sign-in page, the
  one-time administrator) is not built yet. K3 builds the session store that DB2 also needs, the
  `sessions` repository, the cookie and the resolver branch, and leaves local password accounts and
  the setup page to DB2. Either can merge first.

## The multi-market model

One realm, `steward`, is the default (K-D3). A market is a group under `/markets/<code>` and a
`market` user attribute, carried in the token by the `market` client scope; a user who works two
markets is in two groups and signs in once. Market-specific rules are flows and policies conditioned
on that attribute: the market MFA authenticator in K5 fires for the markets configured to need it,
and the market-scoped policy in K4 denies a review outside the user's markets.

Realm-per-market is the other model, and the plan ships it as a template rather than a story: the
same realm JSON rendered per market from a `markets` variable, exercised in CI for two markets, with
what it buys (a separate user database, its own identity providers, themes, password policy and data
residency) and what it costs (no SSO across markets without brokering, N copies of every client, N
promotions per change). Keycloak's Organizations, in the product since 26, sits between the two:
several organisations in one realm, each with its own domains, members and identity providers; the
Architecture guide says when it is the right boundary and when it is not.

## The guides, and the questions they answer

Each guide lives at `kloakware/docs/<Name>.md`, is written for an engineer who will run and extend
kloakware, and ends with the interview questions it answers, the answer written out, and the file in
this repository that proves it. The ten questions from the brief are Q1 to Q10; Q11 onward are
added.

| Guide          | Step | Answers                                                 |
| -------------- | ---- | ------------------------------------------------------- |
| Architecture   | K1   | Q1, Q11, Q12                                            |
| Configuration  | K2   | Q9, Q13, Q14                                            |
| SignIn         | K3   | Q5, Q15, Q16                                            |
| Tokens         | K4   | Q6, Q17                                                 |
| Extensions     | K5   | Q7, Q8, Q18                                             |
| Federation     | K6   | Q19, Q20                                                |
| Clustering     | K7   | Q2, Q21                                                 |
| Deployment     | K8   | Q22, Q23                                                |
| Upgrades       | K9   | Q3, Q24, and Q9 again with the pipeline running         |
| Observability  | K10  | Q10, Q25                                                |
| Security       | K11  | Q4, Q26, Q27, and Q5 again with revocation end to end   |
| InterviewGuide | K12  | all of them, consolidated, with the strategy comparison |

The added questions:

- **Q11.** Keycloak Organizations exist since 26. When is an organisation the right tenant boundary
  instead of a realm, and what does it not give you?
- **Q12.** Build-time versus runtime options in the Quarkus distribution: what `kc.sh build` does,
  why `--optimized`, and what goes wrong when an image is built per environment.
- **Q13.** keycloak-config-cli, the Terraform provider, the Operator's realm import and
  `kc.sh export`: which owns what, and how do secrets stay out of realm JSON?
- **Q14.** How do you detect configuration drift between Git and a running realm, and fail on it?
- **Q15.** A server-rendered application behind a BFF: confidential client, PKCE anyway, where the
  tokens live, and what the browser gets.
- **Q16.** How do you rotate a realm's signing keys without breaking the applications that verify
  its tokens?
- **Q17.** Realm roles, client roles, composite roles, groups and attributes: which for what, and
  what ends up in the token?
- **Q18.** A Keycloak upgrade breaks a custom SPI. How do you find out before production, and how
  do you version extensions against Keycloak?
- **Q19.** LDAP federation: import or no import, read-only or writable, the sync modes, and what
  users experience when the directory is down.
- **Q20.** A brokered sign-in stops at "account already exists". What is the first-login flow doing,
  and how are accounts linked safely?
- **Q21.** Persistent user sessions arrived in 26. What changed about Infinispan sizing, restarts
  and sticky sessions?
- **Q22.** Operator, Helm chart or plain manifests, and how do you keep an AWS and an Azure
  deployment of the same service equivalent?
- **Q23.** Multi-region: active-active or active-passive, and what does the database force on that
  choice?
- **Q24.** What is the rollback story for a minor upgrade whose schema migration has already run?
- **Q25.** How do you size a deployment for a login rate, and which number tells you first that you
  got it wrong?
- **Q26.** DPoP versus mTLS-bound tokens: what each protects against, and when you pick which.
- **Q27.** How do you keep the admin API, and the service accounts that automate it, least
  privilege?

## Workstreams

Each is one branch off `master` and one pull request; sibling branches touching the same file are
merged forward, never stacked. Every pull request carries a CHANGELOG entry, the guide, the answers,
and tests that would fail if the behaviour regressed.

#### K0 — This plan and the boundary documents ✅ Done, [#124](https://github.com/decionis/steward/pull/124)

This file; the new boundary and threat in ThreatModel; one sentence in OpenCore placing kloakware
in the free column and the platform's identity where it was; the README's sign-in methods; the
CODEOWNERS entries for `kloakware/config/`, `kloakware/extensions/` and `kloakware/deploy/`; the
discovery entry in `llms.txt`. No guide; the answers start with K1.

#### K1 — The server ✅ Done, [#126](https://github.com/decionis/steward/pull/126)

The Maven parent and `server/`: a Dockerfile that builds Keycloak 26.8 (pinned by digest) with
`kc.sh build --db=postgres --health-enabled=true --metrics-enabled=true --cache=ispn` and starts it
`--optimized`; the local compose file with PostgreSQL and keycloak-config-cli applying a minimal
`steward` realm (the `steward` confidential client, the six realm roles, PKCE required, a dev-only
seeded user); a Testcontainers smoke test that signs that user in at the token endpoint and reads the
roles back; the path-filtered workflow `kloakware.yml` (Maven verify, the license allowlist, the
smoke test). _Guide: Architecture_ (realms, clients, scopes, the single-realm and realm-per-market
models, Organizations, the Quarkus distribution and its build-time options, how kloakware is laid
out). _Answers: Q1, Q11, Q12._

#### K2 — Configuration as code

`config/realms/steward.json` for keycloak-config-cli with `$(env:...)` variables per environment:
the market groups and attribute, the `market` client scope, the role model, the password and
brute-force policies, the token lifetimes (access 5 min, SSO idle 30 min, SSO max 10 h, refresh
rotation with zero reuse, offline tokens off), the browser flow. `config/terraform/` with the
`keycloak/keycloak` provider for what differs per environment: redirect URIs, web origins, the
client secret from the secret store. The realm-per-market template rendered from a `markets`
variable. Drift: a CI job that runs config-cli in validate mode and `terraform plan
-detailed-exitcode` against a container started from K1, failing on any change. Promotion by Git
tag through dev, QA, staging, production with GitHub environments gating each. _Guide:
Configuration._ _Answers: Q9, Q13, Q14._

#### K3 — Steward signs in through kloakware

In Steward: `infra/auth/oidc/` (the client with PKCE, the ID-token verification with `jose` against
the issuer's JWKS, the session store over `sessions`, the role mapper), the routes
`app/api/auth/oidc/{start,callback,backchannel-logout,sign-out}`, the resolver branch that turns a
`steward_session` cookie into a `StewardSession`, `middleware.ts` accepting it in live mode, the
third path on `/sign-in`, the configuration `STEWARD_OIDC_ISSUER_URL`, `STEWARD_OIDC_CLIENT_ID`,
`STEWARD_OIDC_CLIENT_SECRET`, `STEWARD_SESSION_COOKIE`, the user upsert by `sso_subject`, and the two
new roles in `domain/auth/StewardSession.ts` with their gates in `application/` (sources and the
workspace connection open to `OPERATIONS`; every record readable by `AUDITS`, nothing writable). Tests
against a fake issuer in-process (no container in `pnpm verify`) plus one end-to-end test in the
kloakware workflow against K1's container. README, Docker guide and the evidence pack updated
(Steward now sets one cookie of its own). In kloakware: the client's backchannel logout URL and
`steward` realm roles assigned to the seeded users. _Guide: SignIn_ (the code flow from a BFF,
lifetimes, rotation, front- and backchannel logout, revocation, key rotation). _Answers: Q5, Q15,
Q16._

#### K4 — Token design and fine-grained authorisation

The `token-mapper-market` protocol mapper (the `market` claim; Steward's roles as one compact claim
under the `steward` scope); "full scope allowed" off; the lightweight access token enabled for the
`steward` client by client policy, so the access token carries the subject and the scopes and
Steward reads the display name from `userinfo`; a `steward-api` resource server under Keycloak
Authorization Services with an attribute-based policy (a review needs `steward-approver` and a
market the user holds), exercised by an integration test that obtains a permission ticket and is
denied outside the market; a measured comparison of token sizes before and after. Steward's own
role gate is unchanged: the platform's authorisation remains the control, as the pull-request
template says. _Guide: Tokens_ (the fat-token problem, lightweight tokens, `userinfo` and
introspection, RBAC against ABAC and fine-grained authorisation, what a payment dashboard should
and should not carry in a JWT). _Answers: Q6, Q17._

#### K5 — The Java extensions

`event-listener`: an `EventListenerProvider` that emits sign-in, sign-out, failed sign-in, password
and admin events as structured JSON to stdout, posts them to Steward's activities endpoint signed
with HMAC, and, behind a Maven profile, publishes to Kafka. `authenticator-market-mfa`: an
`Authenticator` placed after the password form that, for a user whose `market` is in the configured
list, requires a second factor: TOTP by default, and a BankID-shaped step (the Swedish RP flow:
start, poll, collect) against a simulator shipped in the compose file. `password-hash-legacy`: a
`PasswordHashProvider` for a salted SHA-256 hash from a pre-Keycloak system, with the realm policy
rehashing to argon2id on first successful sign-in. Each a shaded JAR with its
`META-INF/services` registration, copied into `server/providers/` and compiled in by `kc.sh build`;
each tested with the Keycloak Test Framework, fully supported since 26.6, with the Arquillian suite
deprecated. _Guide: Extensions_ (Provider and ProviderFactory, the session, configuration through
`--spi-*` options, packaging, testing, deploying, versioning against Keycloak). _Answers: Q7, Q8,
Q18._

#### K6 — Federation and brokering

`user-storage-steward`: a `UserStorageProvider` over Steward's `users` table, read-only with import
on first sign-in and a `CredentialInputValidator` for Steward's argon2id hashes, so an operator who
started on local accounts moves to kloakware without a password reset. LDAP user federation against
an OpenLDAP container in the compose file, with the import, sync and edit-mode choices written down
and tested. Identity brokering: a second realm in the same container standing in for a corporate
OpenID Connect provider, a SAML example, broker mappers that set `market` from the provider's
claims, and the first-login flow with account linking. Entra ID and Google documented as the
production equivalents. _Guide: Federation._ _Answers: Q19, Q20._

#### K7 — Clustering and high availability

Two kloakware nodes in the compose file sharing PostgreSQL, discovered through `jdbc-ping`
(Keycloak's default since 26.1: a JGroups table in the database, no multicast, nothing extra to
run), with a test asserting a cluster of two from the Infinispan metrics; the `kubernetes` stack
(DNS_PING over a headless service) as what the Operator sets on EKS and AKS; persistent user
sessions, the default since 26, and what they change about restarts and cache sizing; the JGroups
failure detection and merge settings that decide what split-brain costs; the external Infinispan
(`cache-remote-*`) that multi-site needs, documented with the reference architecture: two clusters
in two availability zones of one region, Aurora PostgreSQL multi-AZ, cross-site replication, AWS
Global Accelerator; cross-region active-active stated as outside the tested envelope. _Guide:
Clustering._ _Answers: Q2, Q21._

#### K8 — Terraform to AWS, with the Azure switch

`deploy/terraform/`: `modules/platform-aws` (VPC, EKS with a managed node group, Aurora PostgreSQL
multi-AZ, Secrets Manager, Route 53, ACM, the load-balancer controller), `modules/platform-azure`
(VNet, AKS, Azure Database for PostgreSQL Flexible Server zone-redundant, Key Vault, Azure DNS,
cert-manager), both producing the same outputs (a kubeconfig, a database endpoint, secret
references, a DNS zone, a certificate); `modules/kloakware`, cloud-agnostic over those outputs: the
Keycloak Operator, the `Keycloak` custom resource pointing at K1's image, the realm applied by a
config-cli Job, a HorizontalPodAutoscaler, a PodDisruptionBudget, a NetworkPolicy, a
ServiceMonitor; `environments/<env>/` selecting `cloud = "aws"` or `"azure"` with one remote state
each (S3 with locking, or Azure Storage). CI authenticates with GitHub's OIDC token to a role in
each cloud, runs `fmt`, `validate`, the policy checker and `plan` on every pull request, applies
`dev` on merge to `master`, and applies QA, staging and production from a tag behind a GitHub
environment approval. Environments are sized by a `tier` variable: `basic` first, one node, the
smallest database, one availability zone, no autoscaling, and `production` once the pipeline has
proven itself, multi-AZ, autoscaling, backups, deletion protection. The Deployment guide carries the
monthly cost of each tier. _Guide: Deployment._
_Answers: Q22, Q23._

#### K9 — Zero-downtime upgrades and the promotion pipeline

The upgrade runbook with its rehearsal in CI: a patch update (26.6 made these rolling with no
downtime, and the Operator's `Auto` strategy runs a job to decide whether rolling is safe before it
touches the StatefulSet) under a k6 login load asserting zero failed requests; a minor update
(recreate, with the schema migrated by Liquibase under its lock by the first new instance), the
database snapshot before it, and `--spi-connections-jpa-quarkus-migration-strategy=manual` to hand
the SQL to a DBA; what to do when a custom SPI fails the new version; rollback when the migration has
run. The realm-config promotion pipeline from K2 run end to end, dev to production. _Guide:
Upgrades._ _Answers: Q3, Q24, Q9 revisited._

#### K10 — Observability

The management port: `/metrics` for Prometheus (JVM, HTTP, the Agroal connection pool, Infinispan,
JGroups), `/health/live`, `/health/ready`, `/health/started`; user event metrics with their tags;
OpenTelemetry tracing to a collector; JSON logs. A Grafana dashboard checked in, scraped through the
ServiceMonitor from K8, shipped to CloudWatch or Azure Monitor through the collector. Alerts with
their thresholds and the reason for each: connection-pool wait time, token-endpoint p95, failed
sign-in rate, cluster size dropping, GC pause, 5xx. A k6 profile from the Keycloak benchmark project
to find the first bottleneck on purpose. _Guide: Observability._ _Answers: Q10, Q25._

#### K11 — Financial-grade hardening

Client policies and profiles: the FAPI 2 Security Profile applied to a `steward-fapi` client
(`private_key_jwt` client authentication, pushed authorisation requests, PKCE S256 mandated,
sender-constrained tokens through DPoP or mutual-TLS certificate binding), tested in the compose
file behind an nginx terminating mTLS; the revocation endpoint and the realm's not-before push; the
compromised-token runbook end to end (revoke, backchannel logout, five-minute window, introspection
at the API for high-value operations); rate limits on `/token` and the login page at the edge;
WebAuthn passkeys as the second factor; the admin API behind a least-privilege service account for
CI. _Guide: Security._ _Answers: Q4, Q26, Q27, Q5 revisited._

#### K12 — The interview guide

`kloakware/docs/InterviewGuide.md`: every question, Q1 to Q27, answered in one place with the file
that proves it; the junior-versus-senior comparison from the brief, each row pointing at the step
that evidences the senior column; a sixty-second story per topic; a mock-interview script; and a
one-page summary of what was built. No code.

## Sequencing

| Stage          | Work         | Gate                                                                                                              |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| **1. Decide**  | K-D1 to K-D9 | Taken, 13 October 2026                                                                                            |
| **2. Server**  | K0, K1       | The image builds, the seeded user signs in at the token endpoint in CI, the workflow is green                     |
| **3. Config**  | K2           | The realm is reproducible from Git; the drift job fails on a hand-made change                                     |
| **4. Steward** | K3, K4       | An operator signs in through kloakware, holds the right roles, is logged out from both sides; tokens measured     |
| **5. Java**    | K5, K6       | Each SPI tested with the Test Framework; a legacy hash and a Steward local account both sign in through kloakware |
| **6. Run**     | K7, K8       | A cluster of two in compose; `terraform plan` clean for AWS and Azure; a dev environment applied by hand          |
| **7. Operate** | K9, K10, K11 | A rolling patch update with zero failed requests; the dashboard and alerts live; FAPI 2 tests green               |
| **8. Prepare** | K12          | Every question answered with its evidence                                                                         |

K3 can be built in parallel with K2 because its tests use an in-process issuer; K4 follows K3; K5,
K6 and K7 follow K1 and are independent of each other; K8 follows K1 and K2; K9 and K10 follow K8;
K11 follows K3; K12 is last.

## Decisions taken

Answered by the owner on 13 October 2026: K-D7 and K-D9 changed from the recommendation, the
rest accepted as recommended.

| #    | Question                                                   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K-D1 | Where does kloakware live?                                 | `kloakware/` in this repository: self-contained, path-filtered CI, extractable later. A separate repository means a second PR bot, second CODEOWNERS and cross-repository links from day one.                                                                                                                                                                                                                              |
| K-D2 | Kubernetes, or a container service?                        | Kubernetes with the Keycloak Operator: EKS and AKS run the same `Keycloak` resource, so the Azure switch is the platform module only. ECS and Container Apps would mean two deployment models and no Operator.                                                                                                                                                                                                             |
| K-D3 | One realm with markets, or a realm per market, by default? | One realm, markets as groups and an attribute; the per-market template shipped and tested beside it; Organizations evaluated in the Architecture guide.                                                                                                                                                                                                                                                                    |
| K-D4 | How does Steward authenticate to kloakware?                | A client secret from the environment in K3; `private_key_jwt` added in K11 with the FAPI profile.                                                                                                                                                                                                                                                                                                                          |
| K-D5 | Which legacy hash does the migration demonstrate?          | Salted SHA-256, the common pre-Keycloak Java case, rehashed to argon2id on first sign-in.                                                                                                                                                                                                                                                                                                                                  |
| K-D6 | Where do audit events go?                                  | Stdout and Steward's activities endpoint in K5; Kafka behind a Maven profile, off by default, so the image carries no broker client unless asked.                                                                                                                                                                                                                                                                          |
| K-D7 | Who applies Terraform?                                     | CI, with GitHub OIDC credentials: `plan` on every pull request, `apply` for dev on merge and for the higher environments from a tag behind an environment approval. Billable resources are fine. Environments start at the `basic` tier and move to production grade.                                                                                                                                                      |
| K-D8 | Which Keycloak version, and how is it moved?               | The current 26.x line, pinned by digest in one place, moved by Dependabot; a minor update is a K9 rehearsal before it is merged.                                                                                                                                                                                                                                                                                           |
| K-D9 | How are Steward's roles represented in kloakware?          | Six realm roles: `steward-viewer`, `steward-operator`, `steward-approver`, `steward-admin`, and two added by the owner, `steward-operations` (the technical team: sources, collections, the workspace connection, health; no reviews) and `steward-audits` (reads every record, changes nothing); markets as groups under `/markets/`; the default role `steward-viewer` so an unmapped user lands on the floor, as today. |

## The boundary documents that change

- **ThreatModel**: boundary 5, Steward's server to the token issuer, with what Steward checks
  (issuer, audience, nonce, signature against cached JWKS, expiry) and T10, a compromised or
  misconfigured identity provider: what it can do (mint a session with any role the realm grants)
  and what it cannot (reach the platform, which re-authorises every write); "Data handling" gains
  the session cookie.
- **OpenCore**: kloakware in the free column; "SSO and SCIM" in the paid column clarified as the
  platform's own identity.
- **README and the Docker guide**: the three sign-in methods, the `STEWARD_OIDC_*` variables, the
  cookie, and a pointer to `kloakware/`.
- **EvidencePack**: "Cookies set by this component" becomes one, `steward_session`; the identity
  provider row names kloakware as operator-run.
- **CODEOWNERS**: `kloakware/config/`, `kloakware/extensions/`, `kloakware/deploy/`.
- **llms.txt**: one entry for this plan.

## Not in this plan

- Provisioning users into kloakware over SCIM. Keycloak 26.8 makes its SCIM API supported; it is
  noted in the Federation guide and is a workstream of its own after K6.
- Deploying Steward itself from the kloakware Terraform. Steward's deployment stays as the Docker
  guide describes it; the Terraform outputs the issuer URL Steward needs, and a Steward module is a
  later addition.
- Replacing the Decionis handoff or local accounts. Kloakware is the third method, not the only one.
- A paid build, a hosted kloakware, or any identity that reaches the Decionis platform. The
  platform's identity is the platform's.
