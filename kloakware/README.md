# Kloakware

The access service operators sign in to Steward through: Keycloak, run by the operator beside
Steward, extended in Java where Keycloak's defaults stop, configured from Git rather than from the
Admin UI, clustered through the Keycloak Operator, deployed to AWS by Terraform with a switch to
Azure. The plan, its decisions and its thirteen workstreams are in
[docs/Kloakware.md](../docs/Kloakware.md); this
directory is built one workstream at a time, and each workstream's guide is under
[docs/](./docs/).

## What is here

```text
kloakware/
  pom.xml                   the Maven parent: Java level, Keycloak version, the license gate
  Dockerfile                the image: the extensions compiled in by a Maven stage, then Keycloak 26.8, pinned by digest, built once, started --optimized
  extensions/               the Java extensions, one module each: the steward claim (K4), the audit listener, the market second factor, the legacy password hash (K5), the Steward user storage (K6)
  deploy/compose/bankid/    the BankID Relying Party API in shape only, for the second factor on a laptop
  deploy/compose/ldap/      OpenLDAP from Debian's slapd, seeded at start: the directory the ldap federation reads (K6)
  deploy/compose/steward-db/ Steward's own database stood in beside kloakware's, one local account seeded, for the user storage (K6)
  config/realms/            the steward realm, as keycloak-config-cli applies it: policies, roles, markets, scopes, flows, storages, brokers; and corp, the corporate identity provider stood in (K6)
  config/realms/dev/        the dev overlay: the seeded operators, the smoke client, Corp's people; laptop and CI only
  config/terraform/         the market realms, one per entry in `markets`, through the Keycloak provider
  config/drift/             the drift check: apply, change by hand, detect, converge
  config/promote/           the realm applied to one environment; the promotion workflow runs it per environment
  observability/            the collector, Prometheus with the alert rules, the Grafana dashboard, the load that finds the first bottleneck (K10)
  upgrade/                  the upgrade runbook rehearsed (K9): a patch rolled under k6 load with the proxy draining, a minor recreated with the schema migrated, the manual SQL export, the rollback
  deploy/terraform/         the platforms as code (K8): a module per cloud with one output contract, the kloakware module on either, an environment per stage, the bootstrap applied once
  deploy/compose/           PostgreSQL, two kloakware nodes behind HAProxy, config-cli: the stack on a laptop (K7)
  deploy/compose/haproxy/   the entry on 8080: round-robin over the nodes, no stickiness, health on each node's management port
  smoke/                    the tests: the image and the realm, the browser sign-in with PKCE, convergence after a hand change, the storages and the brokers driven as a browser, the cluster of two
  docs/                     one guide per Keycloak concept, each ending in the interview questions it answers; InterviewQuestions.md aggregates them all
  ../test/e2e/              Steward signing in through this stack, end to end (K3), run by the sign-in job
```

## Run it

```bash
cd kloakware/deploy/compose && cp .env.example .env && docker compose up --build
```

The admin console is at `http://localhost:8080/admin`, the realm at
`http://localhost:8080/realms/steward`, health at `http://localhost:9000/health/ready` and metrics
at `http://localhost:9000/metrics`. The bootstrap admin and the seeded operator, `erin.example`,
take their passwords from `.env`; the values in `.env.example` are for a laptop and nothing else.
The realm's `steward` client is the one Steward will sign in through from K3; its redirect and
logout URIs are built from `STEWARD_URL`.

## Test it

```bash
mvn --file kloakware/pom.xml verify
```

Needs Docker and Java 17 or later. The tests build the server image, start it against PostgreSQL,
apply the realm and the dev overlay exactly as the compose file does, and prove what Steward's
sign-in relies on: the discovery document, a sign-in that carries the realm roles and the market
claim, a five-minute access token, a refresh token that rotates and is refused when reused, the
management port answering health and metrics, the Authorization Code flow with PKCE through the
login page itself with a request without PKCE and one with an unknown redirect URI refused, and a
change made by hand undone by the next apply. Every credential is generated for the run. CI runs
the same command on Java 21, the server's own level, in
[`.github/workflows/kloakware.yml`](../.github/workflows/kloakware.yml), then the Terraform drift
check:

```bash
kloakware/config/drift/CheckDrift.sh
```

Needs Terraform 1.5 or later as well. It starts the compose stack, applies the market realms from
`config/terraform`, proves a clean plan, changes a realm by hand, proves the plan reports it, and
proves the next apply puts it back.

## The pins

Keycloak has no long-term-support line, only the newest release receives fixes, so the image in
`Dockerfile` is pinned by digest and moved by Dependabot; `keycloak.version` in `pom.xml` is the
Java API the extensions compile against and moves with it. The Dockerfile's first stage compiles the
extensions from source, so `docker build` here needs nothing but Docker, and nothing is ever dropped
into a running container. keycloak-config-cli and PostgreSQL
are pinned by digest in the compose file and in the smoke test, the same digests in both. The
license gate in `pom.xml` applies the policy `scripts/CheckLicensePolicy.mjs` applies to Steward's
own dependencies: what ships is permissive, or the build fails.
