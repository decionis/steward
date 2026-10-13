# Kloakware

The access service operators sign in to Steward through: Keycloak, run by the operator beside
Steward, extended in Java where Keycloak's defaults stop, configured from Git rather than from the
Admin UI, clustered through the Keycloak Operator, deployed to AWS by Terraform with a switch to
Azure. The plan, its decisions and its thirteen workstreams are in
[docs/Kloakware.md](https://github.com/decionis/steward/blob/master/docs/Kloakware.md); this
directory is built one workstream at a time, and each workstream's guide is under
[docs/](./docs/).

## What is here

```text
kloakware/
  pom.xml                   the Maven parent: Java level, Keycloak version, the license gate
  server/Dockerfile         the image: Keycloak 26.8, pinned by digest, built once, started --optimized
  server/providers/         the extension JARs compiled into the server (from K5)
  config/realms/            the steward realm, as keycloak-config-cli applies it
  config/realms/dev/        the dev overlay: the seeded operator and the smoke client; laptop and CI only
  deploy/compose/           PostgreSQL, the server, config-cli: the stack on a laptop
  smoke/                    the smoke test: builds the image, applies the realm, signs in, reads the roles back
  docs/                     one guide per Keycloak concept, each ending in the interview questions it answers
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

Needs Docker and Java 17 or later. The smoke test builds the server image, starts it against
PostgreSQL, applies the realm and the dev overlay exactly as the compose file does, and proves what
Steward's sign-in relies on: the discovery document, a sign-in that carries the realm roles, a
five-minute access token, a refresh token that rotates and is refused when reused, and the
management port answering health and metrics. Every credential is generated for the run. CI runs
the same command on Java 21, the server's own level, in
[`.github/workflows/kloakware.yml`](../.github/workflows/kloakware.yml).

## The pins

Keycloak has no long-term-support line, only the newest release receives fixes, so the image in
`server/Dockerfile` is pinned by digest and moved by Dependabot; `keycloak.version` in `pom.xml` is
the Java API the extensions compile against and moves with it. keycloak-config-cli and PostgreSQL
are pinned by digest in the compose file and in the smoke test, the same digests in both. The
license gate in `pom.xml` applies the policy `scripts/CheckLicensePolicy.mjs` applies to Steward's
own dependencies: what ships is permissive, or the build fails.
