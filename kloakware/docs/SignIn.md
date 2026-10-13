# Sign-in: the code flow from a BFF, lifetimes, logout and revocation

The third guide of the kloakware series. It explains how Steward signs an operator in through
kloakware: the Authorization Code flow with PKCE run by a server-rendered application behind its own
backend, where the tokens live and what the browser is given, how the ID token is verified, how the
issuer's keys rotate without anyone noticing, what the realm's lifetimes mean, how a session ends
from either side, and what "revoke" means in a system of short-lived tokens. It ends with the
interview questions it answers, Q5, Q15 and Q16 of the plan. The code it describes is the third
workstream, K3, in the Steward tree: `infra/auth/oidc/` (the provider, the client, the flow cookie,
the role mapper), `application/auth/` (the identity store and the sign-in service), the routes
under `app/api/auth/`, the resolver in `infra/auth/`, and the end-to-end test
[`test/e2e/KloakwareSignIn.test.mjs`](../../test/e2e/KloakwareSignIn.test.mjs).

## The flow, as built

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as Steward server
  participant K as kloakware
  B->>S: GET /api/auth/oidc/start?returnTo=/signals
  S->>B: 302 to kloakware /auth (code, PKCE S256, state, nonce) + steward_oidc_flow cookie (sealed, 10 min)
  B->>K: the login page; username, password, a second factor where the realm asks
  K->>B: 302 to /api/auth/oidc/callback?code&state
  B->>S: GET /api/auth/oidc/callback (with steward_oidc_flow)
  S->>K: POST /token: code, client secret, code verifier
  K->>S: ID token, access token, refresh token
  S->>S: verify the ID token; upsert the user; insert a session row; record SIGNED_IN
  S->>B: 302 to /signals + steward_session cookie (opaque, HttpOnly, 10 h); steward_oidc_flow cleared
  K-->>S: POST /api/auth/oidc/backchannel-logout (logout_token) when the issuer session ends
  B->>S: POST /api/auth/oidc/sign-out
  S->>B: 303 to kloakware /logout?id_token_hint&post_logout_redirect_uri=/sign-in; steward_session cleared
```

Two cookies, both HttpOnly, both set by Steward, neither a token. `steward_oidc_flow` lives ten
minutes and carries the state, the nonce, the PKCE verifier and the return path, signed with a key
derived from the client secret so that only a value this server issued is accepted.
`steward_session` is thirty-two random bytes, the key of a row in Steward's `sessions` table, and
the only thing the browser holds afterwards. The access and refresh tokens the issuer returned are
not kept: Steward does not call anything as the user, so it has no use for them, and what it does
not keep cannot leak. The ID token is kept on the session row for one purpose, the `id_token_hint`
of the end-session request, which spares the operator a confirmation page at sign-out.

## Confidential client, PKCE anyway

Steward is a server-rendered application with a backend of its own, so it is a _confidential_
client: it can hold a secret, and it presents it when it exchanges the code. That already makes a
stolen code useless without the secret. PKCE is added anyway, because the realm requires it for
every client and because it costs nothing: the verifier is generated per sign-in, its SHA-256 goes
out with the authorisation request, and the verifier itself goes to the token endpoint, so a code
intercepted on the redirect cannot be exchanged by anyone who did not start the flow. The state
binds the callback to the browser that started; the nonce binds the ID token to the same.

What the browser gets is a redirect, a code, and one opaque cookie. What it never gets is a token,
a role, or anything it could present elsewhere. The session cookie is `SameSite=Lax`, which is what
a top-level navigation back from the issuer needs: `Strict` would drop the flow cookie on the
callback and break every sign-in, which is the first thing a team learns when it tightens cookies
by reflex.

## Verifying the ID token, and following a key rotation

The callback believes nothing it is told. The code is exchanged on the server; the ID token that
comes back is verified against the issuer's published keys: the signature, the issuer (`iss` must
be the configured URL, exactly), the audience (`aud` must be Steward's client id), the expiry with
a minute of tolerance, and the nonce, which must be the one this browser's flow began with. A token
from another issuer, for another client, for another flow, or signed with a key the issuer does not
publish is refused, and `OidcProvider.test.ts` proves each refusal.

The keys come from the issuer's JWKS document, read once and cached for the process. A realm
rotates its keys by adding a new key provider with a higher priority: the new key signs from then
on, the old one stays _passive_, published but no longer signing, until every token it signed has
expired, then it is removed. A verifier that caches the JWKS follows this without a restart if it
does one thing: when a token names a `kid` the cache does not hold, fetch the document again, once,
with a floor on how often. Steward's provider does exactly that, and the test rotates the fake
issuer's key, proves the old cache refuses the new token, publishes the key, and proves the
refetch accepts it. What breaks rotation in practice is a verifier that pinned one key, cached the
document forever, or had no floor and could be made to fetch on every request by a stream of tokens
with made-up `kid`s.

## Lifetimes, and what a Steward session is

The realm's numbers, from K1 and K2: an access token lives five minutes; a refresh token is revoked
when used and a reuse is refused; the SSO session idles out after thirty minutes and ends after ten
hours whatever happens. A Steward session is capped at ten hours, the same ceiling, and is not
extended by activity, because Steward keeps no refresh token to extend anything with: the issuer's
session and Steward's are two sessions with one beginning, and the backchannel logout is what keeps
their ends together.

If Steward ever called the platform or another API as the operator, it would keep the refresh
token on the session row, encrypted under the operator's key as the persistence plan does for
credentials, and refresh the access token server-side before each call. K4 and K11 return to that
question; today the platform is read with the organisation's own credential, so there is nothing to
refresh.

## Logout, in both directions

**From Steward.** The shell shows "Sign out" to a session that came through kloakware, as a form that
posts, so that no link and no image tag can sign anyone out. The route revokes the session row,
clears the cookie, and sends the browser to the issuer's end-session endpoint with the ID token as a
hint and the sign-in page as the return address, so the kloakware session ends too and the operator
lands where they can sign in again.

**From the issuer.** When the kloakware session ends anywhere, from another application, from the
account console, from an administrator's "logout all", the realm posts a logout token to Steward's
backchannel URL. It is verified like an ID token, and checked for what makes it a logout token: the
`events` claim naming the backchannel-logout event, no `nonce`, a `sid` or a `sub`. Every Steward
session that began with that issuer session is revoked; the next request from any of those browsers
is refused by the resolver. The end-to-end test signs in, ends the user's sessions through the
admin API, and watches `/api/auth/session` turn from 200 to 401.

Front-channel logout, the other mechanism, has the browser load an iframe per client at the
issuer's logout page; it depends on the browser being there and on third-party cookies, and
kloakware does not enable it.

## Revocation: the compromised token

A token cannot be un-issued, so "revoke" is a set of layers, each bounding what the one above it
cannot:

1. **The access token is five minutes long.** Whatever a stolen one can do, it can do for five
   minutes. This is the layer that makes every other one cheap.
2. **The refresh token rotates and detects reuse.** A refresh token used twice is a theft signal;
   the realm revokes the whole token chain on it, and `SignInSmokeTest` proves the refusal.
3. **The session is the kill switch.** Steward's sessions are rows, and a revoked row refuses the
   next request immediately, whatever token was ever issued. The realm's session has the same
   property on its side, and the backchannel logout joins the two.
4. **The issuer can be told.** `/protocol/openid-connect/revoke` revokes a refresh token; the
   realm's "not-before" policy, pushed to clients, refuses every token issued before a moment; an
   administrator's "logout all" ends sessions and fires the backchannel.
5. **High-value operations introspect.** An API that must not honour a token for even five minutes
   after a revocation calls `/protocol/openid-connect/token/introspect` before acting, trading a
   round trip for immediacy, on those operations only.

Across microservices the question is where each layer sits: a gateway that validates signatures
locally for everything, introspects for the few operations that warrant it, and honours the
not-before timestamp; services that trust the gateway; a session store that is the one place a
compromise is ended. Steward is the simplest case of that shape: one session store, one resolver,
no token in the browser to steal in the first place.

## Roles, into the session

The realm's roles arrive in the ID token's `realm_access.roles`. They are there because the
`steward` client carries a mapper that puts them there: Keycloak's built-in `roles` scope writes
realm roles into the access token only, and a client that consumes the ID token, as a BFF does,
reads nothing from a token it never looks at. That mapper was the end-to-end test's first finding.
The role mapper then takes the `steward-*` ones onto Steward's six, ignores everything else, and
gives a user with no known role `VIEWER`, the floor, the same rule the Decionis handoff's parsing
applies. The user row carries the roles as of
the last sign-in; a change in kloakware takes effect at the next sign-in, or sooner if an
administrator ends the user's sessions, which the backchannel turns into an immediate re-sign-in.
`OPERATIONS` and `AUDITS`, added by the plan's decisions, arrive the same way and gate what the
permission table says they gate.

## Pitfalls

- **`redirect_uri` is compared as a string.** `STEWARD_PUBLIC_URL` must be exactly the origin the
  realm's `STEWARD_URL` was rendered with, scheme, host and port; behind a proxy, set it rather
  than trusting the request's own origin.
- **The backchannel must reach Steward.** On a laptop, the kloakware container cannot reach
  `localhost:3000`; `host.docker.internal:3000`, as both `STEWARD_URL` and `STEWARD_PUBLIC_URL`,
  can. The end-to-end runner does this.
- **Secure cookies over HTTP.** The realm's own cookies are `Secure`; a browser returns them on
  `localhost`, a test client must do the same. Steward's cookies are `Secure` only when its origin
  is `https`, so a laptop works and a deployment is protected.
- **Clock skew.** A minute of tolerance on `exp` and `iat`; more hides a broken clock.
- **One issuer, exactly.** The discovery document's `issuer` must equal the configured URL, so a
  misconfigured hostname fails at the first request rather than at the first token.

## Interview questions

### Q5. "If a user's token is compromised on the payment dashboard, how does your architecture handle immediate revocation across multiple microservices?"

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

### Q15. "A server-rendered application behind a BFF: confidential client, PKCE anyway, where the tokens live, and what the browser gets."

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
