# Threat Model

[Architecture.md](./Architecture.md) describes how Steward is built. This describes what it is defending
against, what it deliberately does not defend against, and where a reviewer can verify each claim in
code.

The short version: **Steward is not authoritative.** It collects signals, renders evidence and forwards
operator reviews. An attacker who fully compromises this tier can misrepresent what an operator sees,
can forward reviews the operator's own credential was already entitled to make, can feed wrong signals
upstream, and can read the credentials of the signal sources this deployment is configured to collect
from. They cannot change a processing limit, alter a policy, decide what a signal weighs, or forge an
entry in the audit ledger, because Steward holds none of those.

## Assets

| Asset                                                       | Where it lives                                               | Exposure if Steward is compromised                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Operator access token                                       | Cookie, server memory during a request                       | High — grants the operator's own rights                                                                             |
| Organization scope (`orgId`)                                | Cookie or request header                                     | High — the tenant boundary                                                                                          |
| Customer account evidence                                   | Fetched per request, not persisted                           | Medium — read exposure, no durable store                                                                            |
| Review decisions                                            | Forwarded upstream, not stored here                          | Medium — an unauthorized forward                                                                                    |
| Signal-source credentials                                   | Mounted secret or environment, read by a connector at start  | High — read access to the operator's own systems, within the credential's scope                                     |
| Decionis ingress secret                                     | `DECIONIS_WEBHOOK_SECRET` in the server environment          | High — write access to this organisation's signal intake; rotate it from the Decionis workspace                     |
| Collected signals                                           | In memory for the request that forwards them, then discarded | Medium — read exposure of what a source returned; a wrong signal upstream, which the platform weighs and can reject |
| Policy logic, identity resolution, grants, dossiers, ledger | **Decionis platform only**                                   | **None — not present in this tier**                                                                                 |

Steward has no database, no session store, and no durable customer data; a collected batch lives for
the request that forwards it. There is nothing here to exfiltrate at rest. That is a design property, not an accident, and it is the single largest
reduction in this tier's blast radius.

## Trust boundaries

```text
[1] Browser  ──►  [2] Steward Next.js server / BFF  ──►  [3] Decionis /v1/cdi APIs
     untrusted         semi-trusted, this repo          authoritative
                              │
                              └──►  [4] Signal sources: CRM, ERP, MCP servers, documents, file servers
                                        the operator's own systems, reached with mounted credentials
```

**Boundary 1 → 2** is the one this repository enforces. Everything from the browser is untrusted:
cookies, headers, path segments, and request bodies.

**Boundary 2 → 3** is where authority actually lives. Steward presents the operator's token and org
scope; the platform decides. Steward cannot elevate what that token is entitled to do.

**Boundary 2 → 4** is the one signal collection adds. A connector reaches only the host its configured
source names, with a credential mounted on the server, and treats what comes back as data: parsed
through the `CapturedSignal` schema, forwarded across boundary 3, never stored and never executed. A
compromised source can feed a wrong signal; it cannot make a decision, because the platform resolves
and weighs every signal it receives and can reject it. [docs/SignalConnectors.md](docs/SignalConnectors.md)
records the decision that put this boundary here.

## Threats and mitigations

### T1 — Unauthenticated access to operator data

An attacker requests a page or API route with no Decionis session.

**Mitigated.** [`middleware.ts`](middleware.ts) requires both the access token and org id cookies on
every path in live mode. Page requests redirect to `/sign-in`; API requests receive `401` rather than
a redirect, so an API client surfaces the authentication failure instead of a parse error. Only
`/api/health`, `/sign-in`, `/llms.txt` and `/llms-full.txt` are exempt; the last two are the
machine-discovery files, public documentation that names no tenant and reads no cookie.

_Verify:_ `middleware.test.ts` — including that a token without an org scope, an org scope without a
token, and an empty cookie value are all rejected.

### T2 — Privilege escalation through a forged role claim

Roles arrive in a client-readable `decionis_roles` cookie. An attacker edits it to `ADMIN`.

**Partially mitigated, and this is the most important entry here.** Steward parses the claim
defensively — unrecognized values are dropped, parsing is case-sensitive, and an unparseable claim
resolves to `VIEWER` rather than to an empty role set. But **the cookie is client-supplied, so Steward's
role check is a UX affordance, not the security control.**

The actual control is upstream: the Decionis platform re-authorizes every review against the
presented token. A forged `ADMIN` cookie changes which buttons render and lets a request past Steward's
own check; it does not make the platform accept a review the token is not entitled to make.

_Verify:_ [`StewardSessionResolver.ts`](infra/auth/StewardSessionResolver.ts) and its tests;
[`OpportunityService.ts`](application/opportunities/OpportunityService.ts) for the `APPROVER`/`ADMIN`
gate.

**Residual risk:** a deployment whose upstream does not re-authorize would be relying on a
client-controlled cookie. Integrators must not treat Steward's role check as authoritative.

### T3 — Cross-organization data exposure

An attacker manipulates `orgId` to read another tenant's portfolio.

**Mitigated upstream, forwarded faithfully here.** The org scope is taken from the session and sent
as both a query parameter and the `X-Decionis-Org-Id` header; it is never taken from user-supplied
route parameters. The platform enforces the tenant boundary against the presented token — an attacker
substituting another org id still presents their own token, which the platform rejects.

_Verify:_ [`DecionisStewardGateway.ts`](infra/api/DecionisStewardGateway.ts),
[`StewardRepositoryFactory.ts`](infra/repositories/StewardRepositoryFactory.ts).

### T4 — Credential leakage to the browser

**Mitigated.** The gateway client is server-only and is constructed inside the composition root. The
credential travels in the `Authorization` header and never in a URL, where it would land in proxy
logs, browser history, and referrer headers.

The subtler exposure is React Server Components: any prop passed from a server component into a
client component is serialized into the RSC payload delivered to the browser. `AppShell` receives the
whole `StewardSession`, which carries `accessToken`. It is a server component, and the interactive
client components, `ReviewAction` and `CollectAction`, receive an id and a boolean each, derived
server-side. Neither the token nor a signal-source credential crosses the boundary.

Nothing in the type system enforces that: adding `"use client"` to `AppShell` would ship the access
token in every page payload without failing typecheck or any behavioural test.

_Verify:_ `JsonHttpClient.test.ts` asserts the token appears in the header and not in the request URL.
`ServerClientBoundary.test.ts` asserts structurally that no client component references `StewardSession`
or any token field, and that every component receiving a session stays on the server.

### T5 — Operators acting on fabricated or stale data

A regulated decision made against wrong data is a real harm, not merely a bug.

**Mitigated.** A live API failure surfaces as an error and **never** falls back to demo fixtures.
Every upstream response is parsed through a Zod contract in `domain/` before entering the application
layer, so schema drift fails loudly at the boundary rather than rendering as a subtly wrong number.
Requests are sent with `cache: "no-store"`.

_Verify:_ `JsonHttpClient.test.ts` (schema rejection, no-store);
[`StewardRepositoryFactory.ts`](infra/repositories/StewardRepositoryFactory.ts) (no fixture fallback path in
live mode).

### T6 — Demo mode reached in a production deployment

The demo session is deliberately privileged — `ADMIN` and `APPROVER`, no credential required.

**Mitigated by configuration.** `StewardRuntimeConfig` defaults `NODE_ENV=production` to live mode, and
live mode throws at startup if `DECIONIS_API_BASE_URL` is unset, so a misconfigured production
instance fails to boot rather than serving fixtures. Setting `STEWARD_DATA_MODE=demo` in production is an
explicit, deliberate act.

_Verify:_ [`StewardRuntimeConfig.ts`](infra/config/StewardRuntimeConfig.ts) and its tests;
`StewardSessionResolver.test.ts` documents the demo session's privileges.

**Residual risk:** an operator who deliberately sets `STEWARD_DATA_MODE=demo` in production serves an
unauthenticated, fully-privileged fixture app. Deployment tooling should assert this variable.

### T7 — Internal detail disclosure through errors

**Mitigated.** [`StewardApiErrorMapper.ts`](infra/api/StewardApiErrorMapper.ts) maps known errors to typed
responses and everything else to a generic `500` with a fixed message. Upstream gateway statuses
outside 400–599 are clamped to `502`.

_Verify:_ `StewardApiErrorMapper.test.ts` asserts an unrecognized error's original message — including
host and port detail — does not reach the response body.

### T8 — A signal source that lies, or a connector that leaks

**Mitigated in part; the rest lands with the first live connector.** A connector is the one place this
tier reaches a system other than the platform. Two failures matter: a source returning data meant to
steer a decision, and a connector carrying data somewhere it should not.

Against the first, a connector's output is parsed through the `CapturedSignal` schema before it
leaves the process, so a source cannot inject arbitrary shapes; each signal names its source and
record, so provenance survives to the evidence panel; and the platform resolves the account reference
and weighs the signal itself, answering per batch: a 2xx accepts it, a 4xx refuses it with a reason and is not retried, a 5xx
is retried with backoff. Steward never acts on
what it collects. Against the second, a batch is forwarded only to the configured platform and is not
written anywhere; collection needs the `OPERATOR` role, checked in `application/`; and the demo
connectors make no network request at all.

Not yet in the tree: the egress allowlist that pins a live connector to the host its source names,
and the size and page limits on document intake. Both arrive with S2 in
[docs/SignalConnectors.md](docs/SignalConnectors.md); until then a live registry holds no connector.

_Verify:_ `SignalService.test.ts` asserts the role gate, the not-configured refusal, and that live
forwarding without a configured ingress reports 503 rather than accepting silently.
`DecionisSignalIngressClient.test.ts` asserts the webhook secret travels in a header and never in the
URL or an error message, that a 4xx is not retried and a 5xx is. `DemoSignalConnector.test.ts`
asserts the fixtures satisfy the schema and name no host, URL, address or phone number.
`CapturedSignal.test.ts` asserts the payload refuses an empty account reference and an out-of-range
confidence.

## The container

`ghcr.io/decionis/steward` is the same server as the release tarball, built by
[`image.yml`](.github/workflows/image.yml) for two architectures and smoke-tested on each before
it is pushed. It holds the built server, its static assets and `public/`. It does not hold a
policy, a baked-in credential, a database, customer data, or a license check (signal-source
credentials are mounted at run time), and it makes no outbound request to any host but the configured
`DECIONIS_API_BASE_URL` and the signal sources the deployment configures. It runs as the
unprivileged `node` user; the base image is pinned by digest and moved only by a Dependabot pull
request; the manifest digest is attested with the workflow's keyless identity, so a consumer can
prove the bytes came from this repository:

```bash
gh attestation verify oci://ghcr.io/decionis/steward:<version> --repo decionis/steward
```

The residual risks are the tier's, not the image's. T2 and T6 apply unchanged: a container that
sets `STEWARD_DATA_MODE=demo` in production serves the privileged fixture session as deliberately
as any other deployment, and `docs/Docker.md` says so. `docker stop` ends it; nothing is
persisted to lose.

## Transport and browser hardening

Set globally in [`next.config.ts`](next.config.ts):

| Header                         | Value                                      | Purpose                                      |
| ------------------------------ | ------------------------------------------ | -------------------------------------------- |
| `X-Content-Type-Options`       | `nosniff`                                  | No MIME sniffing                             |
| `X-Frame-Options`              | `DENY`                                     | No framing — clickjacking on review actions  |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`          | No path leakage to third parties             |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=()` | No device access                             |
| `Cross-Origin-Opener-Policy`   | `same-origin`                              | Process isolation                            |
| `Cross-Origin-Resource-Policy` | `same-site`                                | No cross-site embedding                      |
| `X-Robots-Tag`                 | `noindex, nofollow, noarchive`             | Operator tooling stays out of search indexes |

`poweredByHeader` is disabled.

### Content-Security-Policy

Set per-request by [`middleware.ts`](middleware.ts) rather than statically, because it carries a
fresh nonce on every response. It applies in **both** data modes — a demo deployment is public-facing
— and to refusals as well as successes, so no response leaves this application without a policy.

```text
default-src 'self';
script-src 'self' 'nonce-<per-request>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

`'strict-dynamic'` lets Next's nonced bootstrap load its own hashed chunks without an allowlist of
filenames, and makes supporting browsers ignore the `'self'` fallback — there is no host allowlist to
get wrong. Production contains **no** `'unsafe-inline'` or `'unsafe-eval'` in `script-src`;
`'unsafe-eval'` and `ws:` are added only when `NODE_ENV=development`, where the dev server compiles
in the browser.

`style-src` retains `'unsafe-inline'`. Styling is CSS Modules emitted as external files, but Next
injects a small amount of inline CSS it does not nonce. This is a materially weaker concession than
the script equivalent: with `script-src` locked down, injected CSS cannot execute.

**Verified against a production build, not just asserted:** all 21 script tags carry the nonce, React
hydrates, stylesheets load, a review `POST` to the BFF succeeds under `connect-src 'self'`, and the
browser console reports no violations.

## Accepted risk and known gaps

Stated plainly, because a threat model that lists only mitigations is marketing.

- ~~No Content-Security-Policy.~~ **Closed.** A nonce-based CSP is now set by
  [`middleware.ts`](middleware.ts) on every response in both data modes — see "Transport and browser
  hardening" above.
- **Role claims are client-readable and client-writable.** See T2. Correct only because the platform
  re-authorizes; integrators must not weaken that assumption.
- **No rate limiting or brute-force protection** in this tier. Expected at the edge or upstream.
- **No CSRF token on the review endpoint.** It is a JSON `POST` requiring a bearer token or a session
  cookie plus an org header; a cross-site form post cannot set the header. A deployment relying purely
  on cookies should confirm `SameSite` is enforced on the Decionis handoff cookies, which are set
  outside this repository.
- **No audit logging in this tier.** Deliberate — the authoritative record is the platform's ledger.
  Steward logs would be a second, weaker, divergent record.
- **The 8s upstream timeout is hardcoded** in `StewardRuntimeConfig` and not configurable per deployment.

## Data handling

- **No telemetry, no analytics, no third-party scripts.** The server tier makes no outbound request
  to any host other than the configured `DECIONIS_API_BASE_URL` and the signal sources the deployment
  configures, each named in configuration and reached with a credential mounted on the server. The
  browser calls only this
  application's own same-origin BFF routes under `/api/steward/`; it never contacts Decionis or any third
  party directly.
- **No customer data at rest.** No database, no cache, no session store, no log of evidence content;
  a collected batch is held in memory for the request that forwards it and then discarded.
- **No cookies set by this application.** Session cookies originate from the Decionis identity
  handoff; Steward only reads them.
- **No PII in URLs.** Account identifiers are opaque references, not customer identity.
