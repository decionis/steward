# Configuration as code: the realm from Git, in every environment

The second guide of the kloakware series. It explains how a Keycloak realm is kept in Git and
applied, which tool owns which resource and why there is never more than one owner, how the
environments differ and how they do not, how drift is detected and undone, and how a change is
promoted from dev to production. It ends with the interview questions it answers, Q9, Q13 and Q14
of the plan. The code it describes is the second workstream, K2:
[`config/realms/steward.json`](../config/realms/steward.json), the Terraform under
[`config/terraform/`](../config/terraform/), the drift check
[`config/drift/CheckDrift.sh`](../config/drift/CheckDrift.sh), the promotion script
[`config/promote/ApplyRealm.sh`](../config/promote/ApplyRealm.sh) and its workflow
[`kloakware-promote.yml`](../../.github/workflows/kloakware-promote.yml), and the tests
`BrowserSignInTest` and `RealmConvergenceTest` under [`smoke/`](../smoke/).

## The Admin UI is a viewer

Keycloak ships an administration console that can change anything, and the first production
incident most teams have with it is a realm nobody can reproduce: a mapper added on a Tuesday, a
lifetime shortened during an audit, a flow edited while debugging. The console shows the realm; it
does not record how it got that way, and it cannot be diffed, reviewed, or applied to the next
environment.

Configuration as code inverts that. The realm is a file in Git; a tool converges the running realm
to the file; the console is for looking, and in production for nothing else. A change is a pull
request with a diff and a reviewer, it reaches dev, QA, staging and production by the same
mechanism, and when the running realm differs from the file, that is drift, and it is detected and
undone rather than discovered.

## The tools, and what each owns

| Tool                                 | What it is                                                                                                 | What kloakware uses it for                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `kc.sh export` and `kc.sh import`    | The server's own realm dump and load, full realm, run with the server stopped or in a separate process     | Reading a realm's shape to learn the representation; a one-time migration; never the pipeline            |
| keycloak-config-cli                  | Reads a realm representation (the same JSON) and brings the running realm to it through the admin API      | The shared `steward` realm, in full: policies, lifetimes, roles, groups, scopes, flows, the user profile |
| The Keycloak Terraform provider      | Realms, clients, roles, mappers, identity providers and more as Terraform resources, with state and `plan` | The per-market realms; from K6, identity providers whose secrets Terraform already holds                 |
| The Operator's `KeycloakRealmImport` | A Kubernetes resource that imports a realm when the server starts on the cluster                           | Not used: it imports, it does not converge, and it cannot be run against a laptop                        |
| The admin REST API, `kcadm.sh`       | What every tool above calls                                                                                | Tests and the drift check: a change made by hand, to prove it is undone                                  |

The rule that keeps the two tools from fighting: **one owner per resource**. A client owned by
config-cli is never also described in Terraform, and the other way round; two owners converge a
resource to two descriptions, and whichever ran last wins until the other runs. The split is by
resource, never by field, because neither tool can be told to leave a field alone. Kloakware's split:

- **keycloak-config-cli owns the `steward` realm**, everything in it, in one file. Values that differ
  per environment, `STEWARD_URL` and the client secret, are substituted from the environment at apply
  time with the `$(env:...)` syntax; the file never holds a secret or a hostname.
- **Terraform owns the market realms**, one per entry in `markets`, from the
  [`market-realm`](../config/terraform/modules/market-realm/main.tf) module: the same policies, the
  same six roles, the same `steward` client, and a `market` claim hardcoded to the realm's market so
  the token has the same shape as the shared realm's. Terraform is the right tool there because the
  set of realms is a variable, and `plan` shows what a change to the variable does before it is done.

## The realm file

[`steward.json`](../config/realms/steward.json) is the realm as keycloak-config-cli applies it.
What K2 added to K1's realm, and why:

- **The password policy**: twelve characters or more, a digit, lower and upper case, a symbol, nothing
  of the username or email, no reuse of the last five. The same string sits in the Terraform module,
  which is the cost of the one-owner rule: a policy that both models share is written twice and kept
  equal by review.
- **Markets as groups**: `/markets/SE`, `/markets/NG`, `/markets/GB`, `/markets/DE`, each carrying a
  `market` attribute. A user who works a market is a member of its group and inherits the attribute.
- **The user profile**, declared: since Keycloak 24 a realm declares the attributes a user may carry,
  who may see and edit each, and how it is validated; an attribute outside the declaration is
  dropped. `market` is declared as multivalued, administrator-edited, validated against the market
  list. The declaration replaces the default, so the four standard attributes are declared with it,
  which is the mistake a first attempt always makes.
- **The `market` client scope**: one mapper reads the `market` attribute, aggregating the groups'
  attributes with the user's own, into a multivalued `market` claim in the ID token, the access token
  and `userinfo`. The seeded operator has no attribute of their own; the claim comes from their group.
- **The client's scopes, explicit**: the `steward` client lists its default scopes and has no optional
  ones, so `offline_access` cannot be requested and a scope added to the realm later does not reach
  the token by accident. K4 revisits what belongs in the token.
- **The browser flow, as a copy**: `steward-browser` is the built-in browser flow re-declared under a
  name of its own, with its forms and conditional-OTP subflows, and bound as the realm's browser
  flow. Built-in flows are not meant to be edited; K5 inserts the market second factor into this one.

The dev overlay, [`dev/steward-dev.json`](../config/realms/dev/steward-dev.json) and
[`dev/master-dev.json`](../config/realms/dev/master-dev.json), is applied after it on a laptop and
in CI, never by a deployment: the seeded operator, now a member of `/markets/SE`, the smoke client,
and plain HTTP accepted on the `steward` and `master` realms. The last one is the overlay's reason to
exist as a separate file: the realm file keeps `sslRequired: external`, which refuses HTTP from any
address outside the private ranges, right for a deployment behind TLS and wrong for a laptop, where
Docker Desktop may present the host's own requests from an address outside those ranges. The overlay
runs with `IMPORT_MANAGED_CLIENT=no-delete` so that it does not remove the clients it does not
mention, and a re-apply on a laptop is always the pair, realm then overlay.

Two settings matter more than they look. `IMPORT_VARSUBSTITUTION_ENABLED=true` is what turns
`$(env:STEWARD_URL)` into a value; with it, an undefined variable fails the run rather than writing
the placeholder into the realm. `IMPORT_CACHE_ENABLED=false` makes config-cli apply an unchanged file
again; by default it skips a file whose checksum it has seen, which is right for a one-shot import
and wrong for a tool whose job is to undo what was changed by hand.

## Environments: what differs, and what never does

Four environments, dev, QA, staging and production, and the same realm file in all of them. What an
environment supplies:

| Supplied by the environment       | How                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Where kloakware answers           | `KLOAKWARE_URL`, a variable of the GitHub environment                             |
| Where Steward runs                | `STEWARD_URL`, a variable; the realm's redirect and logout URIs are built from it |
| The administrator config-cli uses | `KLOAKWARE_ADMIN_USER` and `_PASSWORD`, secrets of the environment                |
| The `steward` client's secret     | `KLOAKWARE_STEWARD_CLIENT_SECRET`, a secret of the environment                    |
| Which markets get their own realm | `markets` in that environment's `tfvars`                                          |

What never differs: token lifetimes, session lifetimes, the password policy, brute-force protection,
the roles, the flows, the scopes. A shorter access token in production than in staging would mean
staging proved nothing; the file forbids it by having one value.

## Drift

Drift is the running realm differing from the file. It arrives three ways: a change in the console,
a change by another tool, and a change by Keycloak itself after an upgrade adds a default. Two
mechanisms catch it:

- **config-cli converges.** Re-applying the file undoes a change made by hand.
  `RealmConvergenceTest` proves it: the test shortens the access token lifetime through the admin
  API and weakens the client's PKCE method to `plain`, re-applies the unchanged file, and reads back
  five minutes and `S256`. The promotion workflow re-applies on every tag for the same reason.
- **Terraform detects.** `terraform plan -detailed-exitcode` exits 2 when the running state differs
  from the configuration, 0 when it does not, and that exit code is a CI gate.
  [`CheckDrift.sh`](../config/drift/CheckDrift.sh) runs it three times against a stack from the
  compose file: clean after apply, 2 after the SE realm's lifetime is changed by hand, 0 after the
  next apply. The `drift` job in `kloakware.yml` runs the script on every pull request that touches
  kloakware.

What neither catches is a change the file does not describe at all: an attribute the user profile
does not declare, a client the file never mentions. config-cli's managed-resource setting decides
that case: with the default it removes what it created before and no longer finds, and leaves alone
what it never created, which is what a shared server with other tenants needs.

## Promotion

A change to the realm is a pull request. When it merges, nothing is applied anywhere. A tag
`kloakware-v<version>` on `master` starts
[`kloakware-promote.yml`](../../.github/workflows/kloakware-promote.yml): the same file, the same
config-cli image by digest, applied to `kloakware-dev`, then `kloakware-qa`, then
`kloakware-staging`, then `kloakware-prod`, each a GitHub environment with its own variables, its own
secrets and whatever reviewers it requires before its job may run. A failure stops the chain; a
rollback is a tag on the previous commit. An environment with no `KLOAKWARE_URL` is skipped with a
notice, so the pipeline exists before the deployments do, which arrive in K8 along with the remote
state that lets the market realms join it.

Terraform promotion follows the same shape once there is state to keep: `plan` on the pull request
with the exit code as the gate, `apply` behind the environment. Until K8, the market realms are
applied by the drift job against a laptop stack, and by hand.

## Pitfalls, each learned once

- **Declaring the user profile replaces the default.** Declare `username`, `email`, `firstName` and
  `lastName` with the new attribute or they lose their validators and permissions.
- **Built-in flows are not yours.** Copy, rename, bind. An edited built-in flow is a merge conflict
  with the next Keycloak release.
- **The file cache.** `IMPORT_CACHE_ENABLED` defaults to true; a drift-undoing run needs it false.
- **Names, not ids.** Realm JSON refers to roles, groups and scopes by name; ids are generated per
  server and never belong in the file.
- **config-cli tracks Keycloak.** Its image tag names the Keycloak line it was built against;
  a major Keycloak update is a config-cli update too, rehearsed in K9.
- **Terraform state is a secret.** The client secret is in it. K8 puts it in an encrypted backend
  with locking; until then it lives only on the laptop that ran the drift check, ignored by Git.
- **"HTTPS required" from a laptop.** `sslRequired: external` lets HTTP through only from private
  addresses, and a container does not always see the host as one. The dev overlay relaxes it; a
  deployment terminates TLS in front and tells the server so with `KC_PROXY_HEADERS`.
- **Secure cookies on plain HTTP.** Keycloak marks its authentication cookies `Secure; SameSite=None`
  whatever the scheme. A browser returns them on `localhost` and `127.0.0.1`, which it treats as
  trustworthy origins; a test client has to make the same exception, or the second step of every
  login fails with "Restart login cookie not found". `BrowserSignInTest` carries its own jar for it.
- **Two owners.** Never.

## Interview questions

### Q9. "How do you ensure environment consistency between Dev, Staging and Production in Keycloak? Describe your CI/CD pipeline for Keycloak realm configurations."

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

### Q13. "keycloak-config-cli, the Terraform provider, the Operator's realm import and `kc.sh export`: which owns what, and how do secrets stay out of realm JSON?"

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
