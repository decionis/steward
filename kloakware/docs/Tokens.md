# Tokens: what a token carries, and what decides

The fourth guide of the kloakware series. It explains what Keycloak puts in a token when nothing is
done about it and why that hurts a system of many services, how kloakware's `steward` client keeps
its tokens to what Steward reads, the one Java extension that makes the claim compact, which token
each party reads, and where coarse roles stop and fine-grained authorisation begins, with Keycloak
Authorization Services deciding per market. It ends with the interview questions it answers, Q6 and
Q17 of the plan. The code it describes is the fourth workstream, K4:
[`extensions/token-mapper-market`](../extensions/token-mapper-market/), the `steward` scope and the
`steward-api` resource server in [`config/realms/steward.json`](../config/realms/steward.json), and
the tests `TokenShapeTest` and `AuthorizationServicesTest` under [`smoke/`](../smoke/).

## The fat token, measured

A new client in Keycloak has _full scope allowed_ on, the `roles`, `profile` and `email` scopes by
default, and no lightweight access token. The access token it issues for the seeded operator in the
`steward` realm carries every realm role the user holds including the realm's own
(`default-roles-steward`, `offline_access`, `uma_authorization`), the account client's roles under
`resource_access`, the person's name, email and username, the allowed origins, and the usual
envelope. The `kloakware-fat` client in the dev overlay is that client, kept on purpose as the
"before".

The `kloakware-smoke` client beside it is shaped like the `steward` client: full scope off, the
`steward` scope, a lightweight access token. Same user, same realm, same moment:

| Token                                              | Bytes | Claims | Roles as                                   | Profile                 |
| -------------------------------------------------- | ----- | ------ | ------------------------------------------ | ----------------------- |
| Fat: full scope, `roles` scope, not lightweight    | 1462  | 21     | `realm_access.roles`, every role, prefixed | name, email, username   |
| Lean: full scope off, `steward` scope, lightweight | 930   | 10     | `steward.roles`, Steward's, short          | none; `userinfo` has it |

`TokenShapeTest` prints the two and asserts the lean one is at least a quarter smaller and carries
neither `realm_access` nor the profile, and that the ID token beside it still names the person.

Why the size matters less than it looks, and the shape more: the token travels in an
`Authorization` header on every request and, in some architectures, in a cookie with a four-kilobyte
ceiling and a logging pipeline that keeps every header. But the real costs of the fat token are
elsewhere. Every service that parses `realm_access` is coupled to the realm's whole role vocabulary,
so adding a role anywhere changes what every service sees. PII rides along to every hop and every
log. And a role is as stale as the token's lifetime: a user whose role was removed keeps it for five
minutes in every service at once.

## What K4 did about it

**One claim, compact, from a mapper compiled into the server.** The `steward` claim is
`{ "roles": ["admin", "approver", "viewer"], "markets": ["SE"] }`: Steward's roles without their
prefix, composites expanded, and the markets from the group the user belongs to and from their
`market` attribute. It is written by
[`StewardClaimMapper`](../extensions/token-mapper-market/src/main/java/com/decionis/kloakware/mapper/StewardClaimMapper.java),
a ProtocolMapper SPI provider: a class that extends `AbstractOIDCProtocolMapper`, declares its
configuration properties (the claim name, the role prefix, the markets group path, the market
attribute, and the standard include-in toggles), is registered in
`META-INF/services/org.keycloak.protocol.ProtocolMapper`, and is attached to a client scope in the
realm file by its provider id, `steward-claim-mapper`. The shape of the claim is a pure record,
[`StewardClaim`](../extensions/token-mapper-market/src/main/java/com/decionis/kloakware/mapper/StewardClaim.java),
tested without a server; the mapper is the thin layer that reads the user model and calls it. The
Dockerfile's first stage compiles the extension with Maven and the second copies the JAR into
`/opt/keycloak/providers/` before `kc.sh build`, so the image is the whole project and nothing is
ever dropped into a running container. K5 adds three more extensions the same way, and the
Extensions guide covers the SPI mechanics in full.

**Full scope off.** With `fullScopeAllowed: false` the client's tokens carry only the roles its scope
mappings grant, which for `steward` is none: `realm_access` is gone, and with it every role that was
never Steward's business. The `steward` claim is the only role carrier, and it is Steward's own
vocabulary.

**The lightweight access token.** `client.use.lightweight.access.token.enabled` drops from the access
token every claim a mapper has not marked `lightweight.claim`: the profile, the email, the username,
the allowed origins, and, which the first measurement showed, the subject itself, because the
built-in `basic` scope's subject mapper is not marked lightweight either. The `steward` scope
therefore carries its own subject mapper with `lightweight.claim` on, beside the `steward` claim's.
What stays: the subject, the session id, the scope, the expiry, the `steward` claim. An API that
receives it learns who and what, nothing more; what the person is called is the `userinfo`
endpoint's to answer, with that same token as the bearer.

**Steward reads the right thing from each.** The ID token tells Steward who signed in and, through
the `steward` claim, what they are. When the ID token names nobody, which is what a lean realm may
decide, the sign-in service reads the profile from `userinfo` once, at sign-in, and keeps it on the
user row. A realm without the compact claim still works: the role mapper falls back to the
`steward-*` realm roles, so a kloakware from before K4 signs operators in unchanged.

## Who reads which token

| Token or endpoint | Read by                                             | Carries                                                                     |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| ID token          | Steward's server at sign-in                         | Who signed in, the nonce, the session id, the `steward` claim, the profile  |
| Access token      | APIs the user calls through a client                | Subject, session, scope, expiry, the `steward` claim; lightweight otherwise |
| `userinfo`        | Whoever holds the access token and needs the person | The profile, on demand                                                      |
| Introspection     | An API that must not trust a token for five minutes | `active`, the claims, right now                                             |
| Refresh token     | The client only, never an API                       | A handle to get the next access token                                       |

Steward today calls nothing as the operator, so it keeps no access token at all: the platform is read
with the organisation's own credential, and the Protocol plan's later workstreams decide whether that
changes.

## From roles to decisions

Roles answer "what kind of user is this"; they do not answer "may this user do this, here, now".
Three levels, each needed where the one before stops:

1. **RBAC.** `steward-approver` may review. Coarse, cheap, in the token, right for what the interface
   shows and for the first gate. Wrong on its own for a payment dashboard, where an approver in
   Sweden must not approve in Nigeria.
2. **ABAC.** The decision reads attributes of the user, the resource and the context: the user's
   markets, the opportunity's market, the amount, the time. Keycloak carries the user's attributes
   and groups; the resource's attributes live with the resource.
3. **Fine-grained authorisation.** The decision is made by a policy engine that knows resources,
   scopes and policies, and can be asked by any service: Keycloak Authorization Services.

Kloakware's `steward-api` is a resource server under Authorization Services. Its resources are the
opportunities per market (`opportunity:SE`, each with a `market` attribute), its scopes are `view`
and `review`, its policies are one role policy (`approvers`: holds `steward-approver`) and one group
policy per market (`market SE`: member of `/markets/SE`), and its permissions combine them: "review
in SE" applies `approvers` and `market SE`, both required; "view in SE" applies `market SE` alone. An
approver in Sweden may review in Sweden and not in Nigeria; the technical team in Sweden may view
there and not review. `AuthorizationServicesTest` asks the token endpoint's UMA grant with
`response_mode=decision` for each case and reads 200 or 403.

How a service would ask, in production: the same request, before honouring an operation, from an API
gateway or the service itself, with the user's token as the bearer and the resource server as the
audience; or Keycloak's policy enforcer in front of the service, configured with the resource and
scope each path maps to; or an RPT, a token that carries the granted permissions, obtained once and
presented afterwards. The platform's own authorisation remains the control in Steward's case, as the
pull-request template says; Authorization Services is how the interface and the APIs beside it decide
the same way.

Two things the policies read deserve naming. A group policy loads the user's groups from the model
unless a `groupsClaim` is configured, so it works with a lean token. A role policy reads roles from
the token presented, unless "fetch roles" is on, in which case it loads them from the user; the
realm sets it, and the Tokens test deliberately decides with the fat token for the matrix so that
the two sources can be compared. What neither can do without a JavaScript or a custom policy is
compare two attributes to each other at evaluation time, which is where a custom policy provider,
another SPI, comes in; the Extensions guide says when to write one.

## What a payment dashboard should carry in a JWT

In: the subject, the session id, the issuer and audience, the expiry and issue time, the
authentication context (`acr`, and `amr` for how strongly the person authenticated), the roles in
the application's own compact vocabulary, the markets or tenants the user may act in, and the scope.
Out: the person's name and email, which `userinfo` answers; every role the realm knows; any list
that grows with the organisation; entitlements that change faster than the token expires; anything a
log must never hold. The ceiling to design for is what every hop can carry, a header of a few
kilobytes, and the rule is that a claim earns its place by being read by a verifier that could not
otherwise decide.

## Pitfalls

- **Full scope is on by default.** Every new client ships every role until someone turns it off.
- **The `roles` scope is default by default.** Removing it from the client's default scopes is what
  removes `realm_access`; full scope off alone leaves the mapper in place with nothing to map.
- **Lightweight tokens drop mapper output too, the subject included.** A mapper whose claim must
  survive needs `lightweight.claim: true`; the `steward` mapper sets it, and the scope carries a
  subject mapper that sets it, because without one the access token names no `sub` at all. The
  measurement is what found this; a token nobody decodes is a token nobody checks.
- **`userinfo` wants the access token.** Not the ID token: a client that keeps only the ID token
  cannot ask.
- **Audience.** An API should check `aud`; the `steward` client's tokens name no API audience yet,
  which an audience mapper on the `steward-api` client adds when a real API verifies them (K11).
- **Role policies read the token.** Unless "fetch roles" is on, a lean token fails a role policy that
  a fat one passes, and the failure looks like a wrong role.

## Interview questions

### Q6. "How did you prevent token bloat in your RBAC solution? If a user has hundreds of roles across different markets, how do you keep the JWT size manageable?"

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

### Q17. "Realm roles, client roles, composite roles, groups and attributes: which do you use for what, and what ends up in the token?"

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
