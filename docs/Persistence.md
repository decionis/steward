# Steward's own database and first-run onboarding

**Status: proposed 25 September 2026, subject to approval. A trust-boundary change, recorded as
one.** Steward persists its own operational records: its users, the decisions its operators
recorded, their activities, and the signal sources it is configured with, plus the Decionis
workspace connection when the environment does not supply it. The database is the operator's
choice: PostgreSQL by default; MySQL, Oracle Database and Microsoft SQL Server supported, so an
operator runs Steward on the database license they already hold. Wherever the operator hosts it,
the first run either loads Decionis account signup or finds the Decionis credentials already
configured, in the database or in the environment. Decionis does not host Steward: operators
download it, as they download NGINX from nginx.org, and run it themselves.

## The decision

> For persisting its own users, decisions, activities and signal sources, Steward's database
> should be agnostic: Postgres by default, but the operator can decide which database to use
> (MySQL, Oracle, MSSQL, Postgres) based on the database license they have. When deploying in a
> hosted environment, it should either load Decionis account signup, or check the Steward database
> for whether Decionis credentials (org key, org id, workspace name) are configured, or the system
> environment.

This supersedes a commitment the tree makes in several places: "no database, no session store, no
customer data at rest" in [ThreatModel.md](../ThreatModel.md), the declined change "persisting
customer evidence, collected signals, reviews, or sessions in this tier" in
[CONTRIBUTING.md](../CONTRIBUTING.md), the "two commitments that survive intact" in
[docs/SignalConnectors.md](./SignalConnectors.md), and the questionnaire rows in
[EvidencePack.md](../EvidencePack.md). The commitment that replaces it is narrower and still
checkable: **Steward stores its own records and never the customer's evidence.** A collected
signal's content is still read, forwarded and discarded; what Steward keeps about a decision is
the Protocol's identifiers and what the operator did. Telemetry stays at none.

## Frictionless deployment, and why it needs a database

The goal is commercial open source that deploys without friction: pull the image or download the
release from the Decionis download page (decionis.ai, the way nginx.org serves NGINX), start it
with the compose file that includes PostgreSQL, open it, and finish in the browser. The first run
shows a setup page: create the administrator, connect to Decionis by signing up or by pasting the
credentials of a workspace that already exists, add the first signal source. No environment file,
no redeploy.

That last step is why Steward needs a database. Without one, a connector and its credential can
live only in the environment or in a mounted file, so every source an operator adds is a
configuration change and a restart, and the credentials of internal systems sit in deployment
manifests. With one, a source is added from the Sources page by an administrator, its credential
is encrypted at rest under the operator's own key, and collection reads it on the server at the
moment of use. Frictionless for the operator, and the credential is held in fewer places, not more.

## Is internal access exposed?

No. Persisting connectors changes where a credential rests, not who can reach the system behind
it:

- **Outbound only.** Steward reaches the operator's internal systems from inside the operator's
  network, on the host each source names, and reaches Decionis over the published API. Nothing
  inbound: Decionis never calls into the operator's network, and Steward opens no port to the
  internet beyond the application itself, behind the operator's TLS termination.
- **The browser sees fingerprints.** A credential is decrypted on the server for one collection
  and never serialised into a page, a route response or a log; the Sources page shows the last
  characters of a fingerprint so an administrator can tell credentials apart.
- **Administrators only.** Adding, editing or rotating a source or the Decionis connection needs
  the `ADMIN` role; collection needs `OPERATOR`; every change is an activity with an actor.
- **The key stays with the operator.** `STEWARD_SECRET_KEY` is theirs, mounted at run time, in no
  image and in no repository; without it the stored credentials are ciphertext.
- **What Decionis receives** is the signals Steward forwards, never a source's credential or its
  address.

## What is stored, and what is not

| Table                | Holds                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | id, email, display name, password hash or SSO subject, roles, status, created and updated times, last sign-in                                 |
| `sessions`           | opaque id, user id, issued and expiry times, revoked time                                                                                     |
| `workspaces`         | the Decionis connection: workspace name, org id, org API key (encrypted), connector id, webhook secret (encrypted), verified time, created by |
| `signal_sources`     | id, name, kind, target, categories, enabled, configuration, credential (encrypted), created by, updated time                                  |
| `signal_collections` | source id, batch id, collected time, count collected, count accepted, the artifact ids the Protocol returned                                  |
| `decisions`          | the Protocol's evaluation id, dossier id, decision type, outcome, policy version, confidence, mode, account reference, evaluated time         |
| `reviews`            | decision id, user id, action (APPROVE, REJECT, HOLD), note, ledger entry id, override id, recorded time                                       |
| `activities`         | user id, kind (signed in, collected, reviewed, source added, workspace connected, and so on), subject reference, occurred time, detail        |

Not stored: the content of any evidence signal (title, detail, values), account rosters (read from
the operator's connectors per request), dossier payloads (read from the Protocol, which is the
authoritative record), and anything about a customer that is not an identifier the operator's own
systems already use.

## The database layer

- **One API over four databases.** [Knex](https://knexjs.org/) (MIT) as the query builder and
  migration runner, with the drivers `pg` (MIT), `mysql2` (MIT), `tedious` (MIT) for SQL Server,
  and `oracledb` (Apache-2.0 or UPL-1.0; its thin mode needs no Oracle client libraries). All
  within the license policy in `scripts/CheckLicensePolicy.mjs`. Considered and not chosen: Prisma
  and Drizzle, which do not support Oracle; TypeORM and Sequelize, which support all four but bring
  an entity model this tier does not need. The choice is decision P1 below.
- **Configuration.** `STEWARD_DATABASE_URL`, whose scheme selects the dialect: `postgres://`
  (default), `mysql://`, `mssql://`, `oracle://`. Pool size and TLS as URL parameters. Live and
  hosted modes require it; demo mode ignores it.
- **Migrations.** Portable Knex migrations under `infra/persistence/migrations/`, run by
  `pnpm db:migrate` and by the container at start (`STEWARD_DATABASE_MIGRATE=on-start`, the
  default), failing closed if the schema is behind rather than serving against it.
- **Portability rules.** No dialect-specific SQL outside the dialect adapters; identifiers as
  36-character strings; timestamps in UTC; JSON as text where a dialect lacks a JSON type; no
  database enums, check constraints instead; no stored procedures or triggers.
- **Placement.** `infra/persistence/` holds Knex, the migrations and the repositories that
  implement interfaces declared in `application/`. Nothing in `app/` or `components/` touches the
  database. Demo mode gets in-memory implementations of the same interfaces, so demo stays complete
  with no account and no database, as [OpenCore.md](../OpenCore.md) promises.
- **Verification.** PostgreSQL as a service container on every pull request; MySQL, SQL Server
  and Oracle (the free container image) in a nightly matrix, each running the migrations and the
  persistence tests.

## Secrets at rest

The org API key, the webhook secret and each connector's credential are encrypted in the database
with AES-256-GCM under `STEWARD_SECRET_KEY`, a 32-byte key from a mounted secret, with a key id per
row so the key can be rotated. They are decrypted only on the server, at the moment of use; the
browser never receives them, the logs never carry them, and the Sources page shows a fingerprint.
Losing the key means re-entering credentials; nothing else is lost.

## Users, sessions, roles

Steward gets its own accounts: email and password, hashed with argon2id, with server-side sessions
in the database behind an HttpOnly, Secure, SameSite cookie. Roles (`VIEWER`, `OPERATOR`,
`APPROVER`, `ADMIN`) live on the user and are enforced in `application/` exactly as today. The
first run creates the administrator from a one-time setup page. The Decionis sign-in handoff stays
as single sign-on: a user may carry an SSO subject instead of a password. The platform still
re-authorises every write it receives with the org API key; Steward's roles gate the interface and
name the actor in surface decisions and overrides.

## Connecting to Decionis: the resolution order

1. **The environment.** `DECIONIS_API_KEY`, `DECIONIS_ORG_ID` and `DECIONIS_WORKSPACE_NAME`,
   with `DECIONIS_CONNECTOR_ID` and `DECIONIS_WEBHOOK_SECRET` when signals are forwarded, under
   the names the deployment bundle emits. This is the self-hosted default and needs no database
   row.
2. **The Steward database.** The `workspaces` row, entered through the setup page or created by
   signup. This is what an operator who set no environment relies on, on a laptop, a VPS or a
   cluster alike.
3. **Neither.** The setup page, administrators only, offers two paths:
   - **Sign up for Decionis**, through the published public onboarding:
     `POST /v1/public/auth/register/start` (owner email and name, organisation name), then
     `POST /v1/public/auth/register/verify` with the one-time code, then a signal-mapping session
     and its deployment bundle, whose org id, API key, connector id and webhook secret are stored
     encrypted in `workspaces`. `POST /v1/public/agents/provision` is the shortcut: a provisional
     shadow workspace with no account, claimable later, clearly marked as provisional.
   - **I already have a workspace**: the org id, org API key and workspace name pasted in, verified
     against `GET /v1/health` and one authenticated read before they are saved.

Every step is recorded as an activity, and rotation goes through the same page. The order is the
same in every deployment, and every deployment is the operator's own; what differs is only which
step answers.

## The boundary documents that change

- **ThreatModel**: the database joins the assets, with the users, the sessions and the encrypted
  credentials in it; two threats are added, credential exposure at rest and account takeover of a
  Steward user; "Data handling" states what is stored and what is not.
- **CONTRIBUTING**: the declined change becomes "persisting customer evidence or collected signal
  content"; Steward's own records are in scope.
- **OpenCore**: "Can I run this without Decionis?" stays yes, and demo mode still needs no
  database; the commitments keep "no telemetry" and drop "no customer data at rest" for "no customer
  evidence at rest"; "hosted Steward" leaves the paid column, since Decionis distributes Steward
  and operators host it.
- **Distribution**: the download page on decionis.ai beside the registries and the release
  tarball, with the compose file that includes PostgreSQL as the first thing an operator runs.
- **EvidencePack**: the rows for data at rest, secrets, sub-processors and the database the operator
  runs.
- **README, Architecture, the Docker guide, the discovery files**: the variables, the compose file
  with a database service and a volume, migrations at start, the dialects.

## Workstreams

#### DB0 — This plan and the boundary documents

#### DB1 — The persistence layer

Knex and the four drivers, `STEWARD_DATABASE_URL`, the migrations and their runner, the health
probe reporting the database, PostgreSQL in CI, the repository interfaces in `application/` with
in-memory implementations for demo mode.

#### DB2 — Users, sessions, roles

Local accounts, argon2id, database sessions, the sign-in page for local accounts beside the
Decionis handoff, the one-time administrator setup.

#### DB3 — The workspace connection

The `workspaces` table with encrypted secrets, the setup page with its three paths, the resolution
order in `StewardRuntimeConfig`, credential verification before save, rotation. Depends on the
Protocol client (C1 in [docs/ProtocolContracts.md, PR #93](https://github.com/decionis/steward/pull/93)).

#### DB4 — Signal sources persisted

Sources created, edited and disabled from the Sources page, credentials encrypted, each collection
recorded with its counts and artifact ids.

#### DB5 — Decisions and activities

Reviews recorded with the Protocol's identifiers, decisions kept as references, the activity log
page. Follows the mapping in C3 and C4 of the Protocol plan.

#### DB6 — The dialect matrix

MySQL, SQL Server and Oracle verified nightly against the migrations and the persistence tests; a
page per dialect in the Docker guide.

## Sequencing

| Stage           | Work     | Gate                                                                      |
| --------------- | -------- | ------------------------------------------------------------------------- |
| **1. Decide**   | P1–P7    | This document approved                                                    |
| **2. Layer**    | DB0, DB1 | Migrations and persistence tests green on PostgreSQL in CI; `pnpm verify` |
| **3. People**   | DB2      | An administrator created on first run; sign-in, roles and sign-out tested |
| **4. Connect**  | DB3      | A deployment with no environment set reaches live shadow through signup   |
| **5. Records**  | DB4, DB5 | A source added, a collection recorded, a review recorded and visible      |
| **6. Dialects** | DB6      | The nightly matrix green on all four                                      |

## Decisions needed

| #   | Question                                                             | Recommendation                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Knex, or an ORM?                                                     | Knex: one query API, portable migrations, all four dialects, MIT, no entity model to fight.                                                                                                                       |
| P2  | Ship all four drivers in the image?                                  | Yes; all four are MIT or Apache-2.0, and the operator's choice must not need a rebuild.                                                                                                                           |
| P3  | Local password accounts, or single sign-on only?                     | Both: local accounts with argon2id, the Decionis handoff as SSO.                                                                                                                                                  |
| P4  | Where does the encryption key come from?                             | A mounted 32-byte secret, `STEWARD_SECRET_KEY`, with a key id per row; a KMS provider later.                                                                                                                      |
| P5  | Migrations at container start, or run by the operator?               | At start by default, failing closed; `off` for operators who run them themselves.                                                                                                                                 |
| P6  | Store the org API key in the database when the environment lacks it? | Yes, encrypted; the hosted case has no other place, and the environment wins when both are present.                                                                                                               |
| P7  | Offer the provisional no-account workspace as the signup shortcut?   | Yes, marked provisional, with its caps stated on the page.                                                                                                                                                        |
| P8  | An embedded database for a single-node trial?                        | Yes: SQLite through Knex (`better-sqlite3`, MIT) when no `STEWARD_DATABASE_URL` is set outside demo, in a volume, so `docker run` alone reaches the setup page; PostgreSQL stays the default for anything shared. |

## Decisions recorded

| Question                              | Decision                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Does Steward persist anything?        | Its own records: users, sessions, workspace connection, sources, decisions, reviews, activities    |
| Is customer evidence stored?          | No. Content is read, forwarded and discarded; identifiers and references are kept                  |
| Which database?                       | The operator's: PostgreSQL by default; MySQL, Oracle Database, SQL Server supported                |
| Does demo mode need a database?       | No                                                                                                 |
| How does a deployment reach Decionis? | Environment, then the database, then signup or pasted credentials on the setup page                |
| Who hosts Steward?                    | The operator, always; Decionis distributes it (registries, tarball, the decionis.ai download page) |
| Telemetry                             | Still none                                                                                         |
