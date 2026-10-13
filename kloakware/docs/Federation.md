# Federation and brokering

Where kloakware's users come from when they are not its own: Steward's local accounts, a directory,
and a corporate identity provider. Each is a different Keycloak mechanism with a different set of
decisions, and K6 builds one of each against a stand-in the compose file runs, so the decisions are
tested rather than described. The plan is [docs/Kloakware.md](../../docs/Kloakware.md); the realm
that wires all three is [config/realms/steward.json](../config/realms/steward.json), with the
corporate provider stood in by [config/realms/corp.json](../config/realms/corp.json).

## Three mechanisms, one realm

| Users from                    | Mechanism          | Who holds the password | What kloakware keeps                                     |
| ----------------------------- | ------------------ | ---------------------- | -------------------------------------------------------- |
| Steward's own `users` table   | User storage SPI   | Steward                | A read-only copy per user, imported on first sign-in     |
| A directory                   | LDAP federation    | The directory          | A read-only copy per user, imported on first sign-in     |
| A corporate identity provider | Identity brokering | The provider           | An account per person, linked to the provider's identity |

The first two are **user federation**: kloakware verifies the password itself, against a store it
does not own. The third is **brokering**: kloakware never sees a password and trusts an assertion
from a provider it has registered with. The user experience differs too. A federated user types a
password on kloakware's login page; a brokered user is sent to their provider and comes back.

## The Steward user storage

[`extensions/user-storage-steward`](../extensions/user-storage-steward/) is a `UserStorageProvider`
over Steward's `users` table: an operator who started on a local Steward account signs in through
kloakware with the password they have, and nothing is reset.

**What the provider implements.** `UserLookupProvider` finds a user by username, email or id;
`UserQueryMethodsProvider` lets the admin console search; `CredentialInputValidator` verifies a
password against the argon2id hash in Steward's row, with Bouncy Castle's generator, the one the
server's own argon2 provider uses, in constant time; `CredentialInputUpdater` refuses a change with
a message that says where to make it; `ImportedUserValidation` is called every time Keycloak loads
the copy. The whole provider is under 300 lines, and the SQL is one SELECT.

**Import on first sign-in.** The first lookup creates the copy: Steward's id as the Keycloak id, the
email as the username, the display name split in two, the realm roles that carry Steward's role
names under the `steward-` prefix. From then on Keycloak holds the copy's sessions, consents and the
identities a broker links, and every later sign-in finds the copy first. The alternative, no import,
makes every lookup a query to Steward and leaves nothing in Keycloak to attach state to; it suits a
store that changes under Keycloak constantly, which a users table does not.

**Validation on every load.** Each time Keycloak loads the copy from its database, the row is read
again: gone from Steward, the copy is removed; suspended, the copy is disabled; otherwise the roles
are brought in line and the copy is handed back with the fields Steward owns read-only. Keycloak's
user cache serves the copy in between, for at most five minutes under the realm's `MAX_LIFESPAN`
policy, so a suspension is visible in the admin console within that; a suspended user's sign-in is
refused at once, because the password check always reads the row. When Steward's database cannot be
reached, the copy is kept as it is. That last rule matters more than it looks: an outage must never
delete users.

**The contract with Steward.** The SELECT lives in the JAR as
[`steward-users.sql`](../extensions/user-storage-steward/src/main/resources/com/decionis/kloakware/users/steward-users.sql),
and Steward's own test, `infra/persistence/KloakwareUsersContract.test.ts`, reads it and fails when
the users entity no longer provides a column it names. A rename on either side fails in CI, not at
an operator's sign-in. Steward decided argon2id for its local accounts in
[docs/Persistence.md](../../docs/Persistence.md) and has not built them yet; the provider verifies
the PHC string every argon2 library writes, with the cost read from the string, and its unit test
checks a vector made with OpenSSL, so the two implementations are known to agree before Steward
writes its first hash.

**On a laptop.** The compose file stands Steward's database in beside kloakware's, on the same
PostgreSQL, from [`deploy/compose/steward-db/Init.sh`](../deploy/compose/steward-db/Init.sh): the
table Steward's migration creates, one local account seeded, a read-only role for kloakware. In a
deployment, Steward's database is Steward's, and kloakware gets a user with SELECT on `users` and
nothing more.

**What the tests prove.** `StewardUserStorageTest` seeds a Steward user with an argon2id hash of a
password of the run's own and signs them in: the token's subject is Steward's id and the roles are
Steward's. A wrong password and an account without a hash are refused; a password reset through
the admin API answers 400, the account being read-only; a row set to `SUSPENDED` refuses the next
sign-in and disables the copy, and a deleted row removes it, each once the cache lets the copy be
validated again.

## LDAP federation

The realm federates a directory through Keycloak's built-in `ldap` provider, configured in the
realm file and applied by config-cli like everything else. The directory on a laptop is OpenLDAP
from Debian's `slapd`, built by [`deploy/compose/ldap/Dockerfile`](../deploy/compose/ldap/Dockerfile)
and seeded at start from [`Seed.ldif`](../deploy/compose/ldap/Seed.ldif): people under
`ou=people`, their market as `departmentNumber` and as membership of a group under `ou=markets`,
their Steward role as membership of a group under `ou=roles`.

### The choices, written down

| Choice        | Setting                                              | Why                                                                                                                                         |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Import        | `importEnabled: true`                                | A copy per user gives Keycloak something to attach sessions, consents, required actions and broker links to; the directory stays the source |
| Edit mode     | `READ_ONLY`                                          | The directory is owned by whoever runs it; kloakware reads it. `WRITABLE` would push changes back; `UNSYNCED` would let the copy drift      |
| Sync          | Changed users every 5 minutes, no periodic full sync | A full sync walks the whole directory; it is for a migration, triggered by hand. Changed-users sync keeps the copies fresh at low cost      |
| Registrations | `syncRegistrations: false`                           | Nobody registers on kloakware's login page; accounts come from the directory                                                                |
| Invalid users | `removeInvalidUsersEnabled`                          | A person deleted from the directory loses their copy the next time it is validated                                                          |
| Pagination    | on, 1000 per page                                    | OpenLDAP and Active Directory both page; a sync of a large directory without it fails on the server's size limit                            |
| Timeouts      | 5 s to connect, 5 s to read                          | What a user waits when the directory is slow, and what bounds the outage case below                                                         |
| Trust email   | `trustEmail: true`                                   | The directory verified the address; kloakware does not send a verification mail                                                             |

The mappers do the shaping: `uid` as the username, `mail`, `givenName` and `sn`, `departmentNumber`
into the `market` attribute, the groups under `ou=markets` into `/markets/<M>` through the group
mapper's `groups.path`, and the groups under `ou=roles` into realm roles through the role mapper.
Everything the steward claim mapper reads for the compact claim is set by one of these, so a
directory user's token looks exactly like a realm user's.

### What users experience when the directory is down

Measured in `LdapFederationTest`, which pauses the directory's container. A directory user cannot
sign in: their password lives there, and kloakware will not verify it against anything else; the
login page shows an error after the read timeout, not a hang. Everyone else signs in as before:
realm users, Steward users, brokered users. Nothing is deleted; when the directory is back, the next
sign-in works, the connection pool having dropped its dead connections. The cost of the outage is
therefore exactly the directory's own users for exactly the outage's length, which is the right
answer for a system whose passwords it does not own. The alternative, caching passwords, is a
feature Keycloak deliberately does not have.

### Active Directory

The same provider with `vendor: ad`: `sAMAccountName` as the username, `objectGUID` as the UUID,
`userAccountControl` through its own mapper so a disabled account stays disabled here, and
`memberOf` as the group strategy, which AD maintains and which saves one query per user. The
`msad-user-account-control-mapper` and the `use.realm.roles.mapping` of the role mapper are the two
settings that catch people out.

## Identity brokering

The realm brokers to a corporate identity provider, stood in by the `corp` realm in the same server:
an OpenID Connect provider with a confidential client for kloakware's broker and a SAML provider with
kloakware's broker as a service provider, both with the same two people-facts to pass on, the market
and the Steward role. In production the provider is Entra ID or Google; the realm's configuration
changes in its URLs and its client, not in its shape.

### OpenID Connect

The `corp` identity provider is a generic `oidc` provider, not the Keycloak-specific one, so the
configuration is what Entra ID or Google would take: the authorisation URL the browser is sent to,
the token and JWKS URLs the server calls, the issuer the ID token must name, PKCE with S256, the
client secret posted. The two URL bases are separate on purpose: the browser reaches the provider at
its public address, the server at whatever address it has for it, and on a laptop or in a container
those differ. The issuer goes with the browser's base, not the server's: Keycloak names the issuer
after the host the login started on, so a token fetched over the internal base still says the public
one, and the test stack, where the two differ, is what showed it.

Mappers turn claims into kloakware state. `market` from the `market` claim into the user attribute;
the advanced group mapper into `/markets/<M>` for each market, matching the claim's value; the
advanced role mapper into `steward-<role>` from the `steward_role` claim. The sync mode is `FORCE`,
so every sign-in re-applies them: the provider is the source, not the first sign-in. That cuts both
ways, and the linking test shows it: `erin.example` held the admin role by hand, and after Corp
links to her account she signs in as the approver Corp states, the admin role revoked by the mapper
that manages it. For a provider that is the source of truth that is the right default; an
organisation that grants roles in kloakware by hand sets those mappers to `IMPORT`, which applies
them on the first sign-in only.

### SAML

The `corp-saml` provider is a SAML service provider: the entity id is the realm's URL, the
assertion's subject is the email, the response comes by POST, the assertion must be signed, and the
provider's signing certificate is fetched from its metadata descriptor and refreshed, so a key
rotation at the provider does not stop sign-ins. The mappers are the SAML twins of the ones above,
over attributes rather than claims, plus two the OpenID Connect side does not need: the first and
last name, which SAML carries as plain attributes where OpenID Connect has standard claims Keycloak
reads on its own. Without them the first sign-in stops at a profile form asking for both. On the
`corp` side, the SAML client signs assertions and responses, does not require signed requests, and
carries the name and the same two attributes.

### The first-login flow

What happens the first time an identity from a provider arrives is a flow of its own,
`steward first broker login`, bound to both providers:

1. **Review profile**, with `update.profile.on.first.login: off`: the profile is taken as the
   provider sent it; the person is not asked to confirm their own name.
2. **Create user if unique**: a new account when no user has that email or username.
3. **Automatically set existing user**: otherwise, the account with that email is linked to the
   provider's identity, and the sign-in continues as that account.

Step 3 is the decision in Q20. Keycloak's default flow stops here with "User with email already
exists. How do you want to continue?" and offers to link after the person proves they own the
existing account: by signing in to it, or by clicking a link in a mail. That check is what keeps an
attacker who controls a provider's account with the same email from taking over the existing
account. The automatic link skips it, and is only right when every provider bound to the flow
verifies the email and is trusted with it: a corporate provider that is the source of truth for the
company's addresses qualifies; a social provider does not. The realm binds the flow to the corporate
providers only, with `trustEmail` on both.

`BrokeredSignInTest` drives both outcomes as a browser: `carl.corp` arrives new, with market SE and
the operator role; `erin.corp`, whose email is `erin.example`'s, signs in as `erin.example`, with
the role and the market Corp states, and leaves one account with that email, now carrying a linked
identity.

### Entra ID and Google

**Entra ID**: an app registration with a web redirect URI of
`<kloakware>/realms/steward/broker/entra/endpoint`, a client secret or a certificate, and ID tokens
enabled; the provider's issuer is `https://login.microsoftonline.com/<tenant>/v2.0`, its endpoints
the tenant's, PKCE on. Groups come as `groups` claim ids, so the advanced group mapper matches ids,
not names; a tenant with many groups sends an overage claim instead, which is the first thing to
check when a mapper silently does nothing.

**Google**: an OAuth client of type web application with the same redirect URI, the issuer
`https://accounts.google.com`, the `hd` claim as the thing to check when only one domain may sign
in. Google states no groups; the market and the role come from Steward's own records or a directory
in that case.

## SCIM, not in this plan

Keycloak 26.8 makes its SCIM API supported, so a provider that pushes users and groups to kloakware
(Entra ID provisioning, Okta) has a standard target. Provisioning is a workstream of its own after
this one; the realm here pulls from a directory and accepts brokered identities, and does not yet
receive pushed ones.

## Interview questions

### Q19. "LDAP federation: import or no import, read-only or writable, the sync modes, and what users experience when the directory is down."

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
