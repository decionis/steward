# Migrating a legacy identity system

How the users, passwords, roles and applications of a legacy identity system move into kloakware
without a password reset, with SiteMinder as the worked example and the strategies for an old LDAP,
an Oracle user store and an in-house SQL table beside it. K13 turns the runbook into a command:
`kloakware/migration/` converts what the legacy system exports, imports it into the realm with the
hashes the legacy providers verify, reports how far the population has moved, and revokes what is
left past the deadline; the SiteMinder agent is stood in by a shim that sets the headers the
applications always read; and the tests move the fixtures end to end. The plan is
[docs/Kloakware.md](../../docs/Kloakware.md); the command is [migration/](../migration/) with the
fixtures under [migration/fixtures/](../migration/fixtures/); the shim is
[deploy/compose/legacy-agent/](../deploy/compose/legacy-agent/); the tests are
`LegacyMigrationTest`, `LegacyAgentTest` and the converters' unit tests.

## What a legacy identity system is made of

A migration is four migrations: the identities, the passwords, the authorisation and the
applications. The four systems in scope keep those in different places, and the strategy follows
from where the passwords are and whether they can leave.

| Legacy system                                 | Identities                                                           | Passwords                                                                                   | Applications integrate by                                                                  | Strategy                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **SiteMinder** (CA / Broadcom Single Sign-On) | the policy server's user directory: an LDAP, AD, Oracle or SQL store | none of its own: the directory's, in its format                                             | a web agent in front of each application, an `SMSESSION` cookie, headers such as `SM_USER` | export the directory (below), broker to SiteMinder during the overlap, stand the agent in with a shim |
| **An old LDAP** (OpenLDAP, eDirectory)        | the directory's entries                                              | `userPassword` in `{SSHA}`, `{SSHA256}`, `{SSHA512}` or worse, readable by an administrator | a bind, or a group lookup                                                                  | export with `ldapsearch` and import with `legacy-ssha`; or federate (K6) until the cut                |
| **Active Directory**                          | the directory's accounts                                             | never exported: AD does not expose hashes                                                   | Kerberos, a bind                                                                           | federate (K6) and let the first sign-in import; the password stays AD's until a reset                 |
| **Oracle** user store                         | a `USERS` table, often behind PL/SQL                                 | a column the application hashed, the algorithm in the application's code                    | SQL from the application                                                                   | one `SELECT` to CSV, a provider for the application's algorithm, import                               |
| **In-house SQL**                              | the same, in MySQL, PostgreSQL or SQL Server                         | the same, of varying quality: salted SHA-256 at best, MD5 or plain at worst                 | SQL from the application                                                                   | the same; plain text is hashed into the realm's own algorithm at import, MD5 gets a reset             |

Two rules decide. **Where the hash can be exported and its algorithm is known, import it** with a
`PasswordHashProvider` that verifies it and never passes the realm's policy, so the first sign-in
replaces it: nobody resets, and the weak hash lives exactly until it is last needed. The Extensions
guide built `legacy-sha256` for the in-house shape; K13 adds `legacy-ssha` for the directory's
family, told apart by the digest's length. **Where it cannot, federate** with a user storage
provider and import on first sign-in, K6's pattern, so the legacy store keeps validating passwords
until each user has signed in once, and then the deadline decides the rest.

## SiteMinder, the worked example

SiteMinder is not a user store; it is a policy server with web agents. That shapes the inventory:

| SiteMinder has                                             | Kloakware gets                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A user directory (the policy server's user store)          | the users, by export and import, or by federation while it lives                                                          |
| Policy domains, realms, rules, responses                   | clients, roles and the claims a mapper writes: a response that set `SM_ROLES` is the `steward` claim                      |
| Web agents on every application                            | nothing on the application; a shim in front of it sets the same headers from the token until the application is rewritten |
| The `SMSESSION` cookie, one for the whole domain           | the realm's single sign-on session and, per application, the application's own session                                    |
| Password policies in the policy server                     | the realm's password policy, applied at reset and change, not at rehash                                                   |
| Federation partnerships (SAML 2.0, OIDC in later releases) | the broker the realm points at SiteMinder during the overlap                                                              |

**The directory.** The fixture is the policy server's OpenLDAP store exported with
`ldapsearch -LLL`: `uid`, `mail`, `givenName`, `sn`, the country attribute as the market, the group
memberships as roles, and `userPassword` in the `{SSHA}` family, base64 of the digest with the salt
appended. The converter splits each value into digest and salt and writes one record per user; an
entry whose password it cannot use, `{MD5}` or plain, is left out and named, for the reset at the
deadline. An eDirectory or Active Directory store differs in attribute names, which the converter
takes as arguments, and Active Directory differs in not exporting hashes at all, which turns the
strategy into federation.

**The agents.** The applications never saw a token; they read `SM_USER`, `SM_USERDN` and the
headers the policy server's responses set. Rewriting every application before the cut would make
the cut wait for the last rewrite, so the agent is stood in: a shim in front of the application
verifies kloakware's token and sets the same headers, and the application moves without a change.
The repository's shim is HAProxy, `deploy/compose/legacy-agent/`: its entrypoint fetches the
realm's signing key from the realm's public endpoint and writes it as PEM, and the configuration
verifies the bearer token's RS256 signature with it, refuses an expired token and one not meant for
the legacy dashboard, sets `SM_USER` from `preferred_username`, `SM_USEREMAIL`, `SM_USERDN` from
the subject, `SM_ROLES` and `SM_MARKETS` from the `steward` claim, drops the `Authorization` header
and, standing in for the application too, echoes what it set. A deployment puts the application
behind it instead of the echo. The shim reads one key, so a signing-key rotation (SignIn guide,
Q16) restarts it; a shim for production reads the JWKS and follows the rotation, which is what an
OIDC-aware proxy such as oauth2-proxy or the ingress's own authentication does, and for a
browser-facing application that proxy also runs the login and holds the session the agent held.
The repository's shim is the header contract, proven.

**The legacy dashboard as a client.** The application that stood behind the agent becomes
`legacy-dashboard` in the realm: a confidential client with the code flow and PKCE, the full
profile in its access token because the shim reads `preferred_username` from it, and its own
audience mapper so the shim can refuse a token for any other client. `LegacyAgentTest` signs in
through the realm's login page as that client, calls the shim, reads `SM_USER=erin.example` and the
roles and markets, and is refused with no token, with a forged signature, and with a token issued
for another client.

**The overlap.** Until every application is behind kloakware, people sign in both ways, and the
two must agree on who they are. The realm brokers to SiteMinder as it brokers to the corporate
provider in K6, SAML 2.0 for the releases that have nothing else, with the first-login flow linking
an incoming identity to the imported account by email automatically, since the policy server's
directory is the source of truth for addresses; the password is then never asked for twice.

## The runbook as code

`kloakware/migration/Migrate.sh` is five movements:

| Movement                              | What it does                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert-ldif users.ldif users.jsonl` | the directory's export into one JSON object per user: username, email, names, market, roles with the realm's prefix, the password as digest, salt and the algorithm `legacy-ssha`; entries without a usable password named and left out                   |
| `convert-csv users.csv users.jsonl`   | the SQL table's export, `username, email, first_name, last_name, market, roles, algorithm, salt, hash`, into the same records                                                                                                                             |
| `import users.jsonl siteminder`       | into the realm through the partial import, in batches, each user with the credential in the provider's shape, the roles, the market as a group and an attribute, `emailVerified` since the legacy system verified it, and the source recorded on the user |
| `status siteminder`                   | every user from that source, and whether the password credential's algorithm is still a legacy one: migrated and pending, by name                                                                                                                         |
| `revoke siteminder [--notify]`        | past the deadline: the legacy credential removed and `UPDATE_PASSWORD` required of everyone still on it, with the mail that asks for it when the realm has a mail server                                                                                  |

Three properties make it a runbook rather than a script. **It is idempotent**: the partial import
runs with `ifResourceExists=SKIP`, the realm's existing emails are read first so a legacy account
that already exists under another username is skipped rather than failing the batch, and a second
run adds nobody and touches nobody, the test proves. **It reports what it did not do**: an email
the export repeats, a user the realm already has, an entry without a usable password, a batch the
server refused, each by name, because the migration's exceptions are the operator's work list.
**It knows where it is**: every imported user carries `legacySource`, a user-profile attribute,
which is what `status` and `revoke` select on; the live rate is the metric K10 wired,
`keycloak_credentials_password_hashing_validations_total{algorithm=~"legacy-.*"}`, a sign-in with
a legacy hash being the moment it is replaced.

The signs-in-and-rehashes step is Keycloak's own, from the Extensions guide: the provider verifies
the legacy hash, answers that it does not satisfy the policy, and Keycloak writes an argon2
credential in the same request. `LegacyMigrationTest` imports both fixtures, reads `legacy-ssha`
back on the imported user, signs her in with the password the directory knew, finds the role and
the market from the export in her token and `argon2` on her credential, counts one migrated and two
pending, imports again and sees nothing change, and revokes: the two who never signed in lose the
legacy credential, must reset, and no longer sign in with the old password.

## Cutover and rollback

The sequence, with the flag that is also the rollback:

| Phase        | What happens                                                                                                                                              | Measured by                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0. Inventory | the directory's schema, the policy domains and responses, the agents and the headers each application reads, the password policy, the federation partners | a table per application: headers read, sessions assumed, owner                                               |
| 1. Coexist   | the realm brokers to SiteMinder; the shim in front of the first application; nobody's sign-in changes                                                     | sign-ins through the broker; the shim's refusals                                                             |
| 2. Import    | the directory exported and imported, in batches, outside the window the directory is busy; `status` says who is in                                        | `imported`, `skipped`, `duplicates`, `left out`                                                              |
| 3. Flip      | per application, or per market, the flag that sends sign-in to kloakware instead of the agent; the broker stays for the applications not yet flipped      | sign-ins by client in the event metrics; failures by error; the legacy-hash validations rising, then falling |
| 4. Watch     | the window in which every active user signs in once: two weeks for an operations team, a quarter for customers                                            | `status`: pending falling; `invalid_user_credentials` not rising; support tickets                            |
| 5. Deadline  | `revoke`: the long tail loses the legacy hash and is asked to reset, by mail                                                                              | `revoked`, then resets completed                                                                             |
| 6. Read-only | the directory stops accepting writes; the policy server stops issuing sessions; the broker is removed                                                     | nothing signs in through the broker for a month                                                              |
| 7. Off       | the policy server and the directory are decommissioned; the shims come out as the applications are rewritten, last and at their own pace                  | the shim's traffic                                                                                           |

The rollback at every phase up to 6 is the flag: an application sent back to the agent signs in as
it did, because the directory still holds the passwords and SiteMinder still runs; a user who
rehashed in kloakware meanwhile has the same password in both places, since rehashing changes the
storage and not the password. What rollback cannot undo is a password changed in kloakware after
the import, which the directory does not have; the overlap is kept short and password changes
during it are announced, or written back to the directory by a writable federation for that window.
After phase 6 there is no rollback, only the snapshot discipline the Upgrades guide describes, and
that is why 6 waits for 4 and 5.

For the other three legacy systems the phases are the same with phase 1 shorter: an old LDAP or a
SQL store has no sessions and no agents to coexist with, so coexistence is the application reading
the realm's token instead of binding to the directory, and the broker is not needed.

## Lessons from building it

- The partial import's `SKIP` is by username; an existing account under another username with the
  same email fails the whole batch with a conflict, so the command reads the realm's emails first.
- A user attribute arrives only if the user profile declares it (K6's lesson again):
  `legacySource` is declared, editable by administrators only.
- A realm role named in the import must exist; the converters add the `steward-` prefix so an
  export that says `operator` means the realm's role.
- `emailVerified` is set at import: the legacy system verified the address, and a reset mail to an
  address the realm considers unverified is the other way to lock the long tail out.
- The realm's password policy applies at reset and change, not at rehash: a legacy password that
  would not pass the policy today still signs in and is rehashed; the policy catches up at the
  user's next change, which is a decision to make visible rather than a surprise to discover.
- HAProxy's `jwt_verify` wants the key as a file and a number compared against a variable, not an
  expression; the shim's entrypoint writes the one, and the configuration stores the time in the
  other.

## Interview questions

### Q30. "You inherit two million users in a legacy system with its own password hashing. Walk me through moving them to Keycloak with no password reset."

First find where the passwords are and whether they can leave, because that decides everything;
then import the hashes with a provider that verifies them once and lets Keycloak replace them.

Two million users is a batch job, not a login-time trick. The legacy system's store is exported
with its hashes, the algorithm is identified from the application's code or the directory's
scheme, and a `PasswordHashProvider` for it is compiled into the server: it verifies the legacy hash
and answers that it never satisfies the realm's policy, so the first successful sign-in rehashes
the password with argon2 in the same request, and the legacy hash is gone the moment it was last
needed. The users are imported through the admin API's partial import in batches, each with a
credential naming that provider, their roles mapped to the realm's, their market as a group, the
address marked verified since the old system verified it, and the source recorded on the user; the
import is idempotent, skips what the realm has, reports what the export repeats and what it could
not use. Then the population moves itself: a metric counts legacy-hash validations as they happen,
a status command counts who is still on the old hash, and a deadline revokes the long tail and
asks them to reset, which is the only reset anyone gets. Where the hashes cannot leave, Active
Directory or a vendor store, the same outcome comes from federation: the store validates the
password on the first sign-in, Keycloak imports the user, and the deadline handles the rest.

_Evidence in this repository:_ `kloakware/migration/` with `Migrate.sh` and its converters;
`legacy-ssha` and `legacy-sha256` in `extensions/password-hash-legacy`; the fixtures under
`migration/fixtures/`; `LegacyMigrationTest`, step by step.

### Q31. "Cutover and rollback: how do you run the legacy sign-in and the new issuer side by side, what do you measure, and when do you turn the old one off?"

Side by side behind a flag per application, with the two systems agreeing on identity through a
broker, measured by sign-ins and failures per client, and turned off only after the deadline has
passed and nothing has crossed the broker for a month.

Coexistence needs the two to agree on who a user is: the new issuer brokers to the legacy one, SAML
or OIDC, and links an incoming identity to the imported account by email, since the legacy
directory is the source of truth for addresses, so a user who signs in the old way during the
overlap lands on the same account. Then one flag per application, or per market, sends its sign-in
to the new issuer; the flag is also the rollback, because the legacy store still holds the
passwords and rehashing in the new issuer changed their storage, not their value. The measures are
the event metrics by client, logins and failures by error, so a flip that produces
`invalid_user_credentials` is seen within minutes; the legacy-hash validations rising with each
flip and falling as users rehash; the status command's pending count; and support tickets, which
are the measure that reaches the people the metrics do not. The old one goes off in two steps: the
deadline, when the long tail is revoked and asked to reset, and read-only, when the legacy store
stops accepting writes and the broker is removed; decommissioning follows a month in which nothing
has crossed the broker. What rollback cannot undo is a password changed in the new issuer during
the overlap, which is why the overlap is short and a writable federation can carry changes back
while it lasts.

_Evidence in this repository:_ the phases table and the flag in this guide; the broker and the
first-login flow in K6; `status` and `revoke` in `migration/`; the event metrics by client in K10.

### Q32. "The legacy is SiteMinder. The applications read `SM_USER` from the agent and never saw a token. How do you move them without rewriting every application first?"

Stand the agent in: a shim in front of each application verifies the new issuer's token and sets
the same headers, so the applications move without a change and are rewritten last, at their own
pace.

SiteMinder's contract with an application is headers set by the web agent after it validated the
`SMSESSION` cookie: `SM_USER`, `SM_USERDN`, and whatever the policy server's responses added, roles
and attributes among them. That contract is reproducible: a reverse proxy that performs the OpenID
Connect login, or verifies a bearer token, and writes the same headers from the token's claims
gives the application exactly what it had. The claims are the realm's to shape, so a response that
used to set `SM_ROLES` is a mapper writing the roles claim, and the proxy copies it into the header.
The proxy must do what the agent did about trust: verify the signature against the issuer's keys
and follow their rotation, refuse an expired token and one issued for another application, and
strip the headers from the incoming request so nobody sets `SM_USER` themselves. For a
browser-facing application the proxy also holds the session the agent held and runs the login; an
OIDC-aware proxy or the ingress's own authentication does that. The repository's shim is the
contract proven in the smallest form: HAProxy verifying the realm's RS256 token with the realm's
key and echoing the headers it set, with the refusals tested. SiteMinder itself stays in the
picture through the overlap as a broker target, so the applications not yet behind a shim keep
their sign-in, and comes out when the last shim is in.

_Evidence in this repository:_ `deploy/compose/legacy-agent/haproxy.cfg` and its entrypoint; the
`legacy-dashboard` client with its own audience in `config/realms/steward.json`;
`LegacyAgentTest`.

### Q8, revisited. "If we need to integrate a legacy, proprietary hashing algorithm for existing user passwords during a migration, how would you achieve this in Keycloak?"

The Extensions guide answered this with the provider: verify the legacy hash, never pass the
policy, let the first sign-in rehash. K13 moves a whole population through it and adds what the
provider alone does not answer. Two providers now, because legacy systems have families, not one
algorithm: the directory's salted SHA, told apart by digest length, and the application's own
salted SHA-256. The import is the part that makes it a migration: the export converted into the
credential's shape, digest and salt base64 with the algorithm the provider is registered under,
imported in idempotent batches with the source recorded. And the end is the part the provider
cannot do: a status that counts who is still on the old hash, a metric that shows the rehashes as
they happen, and a deadline that removes what is left and asks for the one reset the long tail
gets. A proprietary algorithm the vendor will not disclose is the case where none of this applies,
and the honest answer is federation to the legacy store until each user has signed in once, then
the same deadline.

_Evidence in this repository:_ `LegacySsha` with its vectors and `LegacySha256`;
`Migration.importUsers`, `status` and `revoke`; `LegacyMigrationTest`.
