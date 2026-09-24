# Distribution: containers, machine discovery, and the commercial boundary

**Status: plan approved for autonomous implementation, 24 September 2026.** Each workstream below
lands as its own pull request off `master`. The commercial boundary it states is recorded as a
commitment in [OpenCore.md](../OpenCore.md).

## The one-paragraph answer

Steward already ships as a source tree, a signed release tarball, and a public demo. What it does
not ship as is the thing most teams reach for first: a container they can pull. The sibling
repository, AgentSafe, solved this well and the plan copies it rather than reinventing it: one
multi-architecture image built by the release workflow, pushed to GHCR with BuildKit's SBOM and
provenance attached, its digest attested with the workflow's keyless identity, and the same
manifest copied by digest to Docker Hub so one digest names a release on both registries. On top
of that sit two things AgentSafe also has and NGINX does not: a machine-readable `llms.txt` so an
agent evaluating Steward finds the right facts without scraping, and a written open-core boundary.
The NGINX model is the frame for the commercial question: the open-source server is complete and
free, the paid product is a subscription you connect it to, and the switch is a credential, never a
crippled build. For Steward that switch is live mode against a Decionis tenant, and the moment
commerce enters is the first review that is meant to execute rather than only be recorded.

## What AgentSafe already does, verified against its tree

| Concern            | AgentSafe                                                                                                                                  | Reused here                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Build              | `docker buildx build --platform linux/amd64,linux/arm64 --sbom=true --provenance=mode=max --push`, in the release job, once                | Yes, verbatim shape                         |
| Registry of record | `ghcr.io/decionis/agentsafe`, pushed with the workflow token                                                                               | `ghcr.io/decionis/steward`                  |
| Tags               | `<version>` immutable; `<major>.<minor>`, `<major>`, `latest` for a stable release                                                         | Same, plus `edge` from `master`             |
| Attestation        | `actions/attest` on the manifest digest, `push-to-registry: true`; `gh attestation verify oci://…` documented                              | Same                                        |
| Docker Hub         | Separate `dockerhub.yml`: copies the attested GHCR manifest by digest, refuses a digest mismatch, attests the Hub name, publishes overview | Same, gated on `DOCKERHUB_PUBLISH_ENABLED`  |
| Base images        | Pinned by digest, pulled from `public.ecr.aws` to dodge Hub rate limits; distroless non-root runtime under Node's permission model         | Digest pins now; distroless is a later step |
| Build stages       | `--platform=$BUILDPLATFORM` for install and build, per-platform only for the runtime stage                                                 | Yes                                         |
| Discovery          | `llms.txt` and `llms-full.txt` at the repo root, `scripts/CheckDiscovery.mjs`, weekly `discovery.yml`                                      | Yes, and served by the app at `/llms.txt`   |
| Open core          | `OPEN-CORE.md`: what is open, what is operated, the seam, five commitments                                                                 | `OpenCore.md`, same structure               |
| Not reused         | Homebrew, `.deb`/`.rpm`, single executable, Helm chart, hosted listener                                                                    | Steward is a web tier; see "Later"          |

Docker Hub already carries four Decionis repositories (`agentsafe` at 1.7K pulls), so
`docker.io/decionis/steward` sits in an established namespace.

## What NGINX teaches, and how it maps

NGINX is the reference for "complete open-source product, commercial layer you connect to".

| NGINX                                                                                         | Steward                                                                                                          |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Open-source nginx is the whole server, BSD-licensed, no feature flags                         | Steward is the whole operator tier, Apache-2.0, no feature flags, demo mode complete forever                     |
| Distributed as source tarballs, signed distro packages from nginx.org, and a Docker image     | Source, a signed release tarball with SBOM and provenance, and now a signed image on GHCR and Docker Hub         |
| `stable` and `mainline` channels; versioned image tags plus moving aliases                    | `<version>` immutable, `<major>.<minor>`, `<major>`, `latest` for releases; `edge` for `master`                  |
| NGINX Plus: same core plus operated value (active health checks, API, dashboard, support)     | The Decionis platform: policy evaluation, execution grants, Decision Dossiers, the ledger, Presence, support     |
| Plus is a subscription: a certificate and key for a private repository and a JWT license file | A Decionis tenant: sign-in handoff, an organisation scope, a plan. No file in the image changes                  |
| Plus reports usage to F5 and has a grace period when it cannot                                | Steward reports nothing; entitlement and metering live in the platform, which sees every review it records       |
| A customer builds the Plus image from the private repository                                  | There is no "Plus image". The same image serves free and paid tenants; what differs is what the platform returns |
| Advisories, CVE process, signed releases                                                      | `SECURITY.md`, private reporting, attested releases; unchanged                                                   |

The one place the mapping is deliberately not followed: NGINX Plus is a different binary with more
features. Steward will not have one. A separate paid build of the operator tier would put policy or
entitlement logic into the repository the trust boundary exists to keep it out of. Paid value is
operated, and the image is the same bytes for everyone.

## Channels

| Channel            | Name                                                    | What it is                                               | Verify with                                                                        |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Container, primary | `ghcr.io/decionis/steward:<version>`                    | Multi-arch image, BuildKit SBOM and provenance, attested | `gh attestation verify oci://ghcr.io/decionis/steward:<v> --repo decionis/steward` |
| Container, mirror  | `docker.io/decionis/steward:<version>`                  | The same manifest, copied by digest after each release   | Same command against the Hub name; the two `inspect` digests match                 |
| Release tarball    | GitHub release `v<version>`                             | Standalone server, CycloneDX SBOM, Sigstore bundle       | `gh attestation verify decionis-steward-<v>.tar.gz --repo decionis/steward`        |
| Source             | `git clone`                                             | `pnpm install && pnpm dev`, demo mode, no credentials    | `pnpm verify`                                                                      |
| Hosted demo        | https://decionis-steward.vercel.app                     | Demo mode, deterministic fixtures, not indexed           | `/api/health`, `/api/steward/portfolio` reports `DEMO`                             |
| Machine discovery  | `/llms.txt` on every deployment; `llms.txt` in the repo | What Steward is, what it is not, where the facts are     | `discovery.yml`, weekly                                                            |

## The image

- **Base**: `node:22-alpine`, pinned by digest, pulled from the AWS public mirror of the Docker
  library so an unauthenticated CI runner is not rate-limited by Docker Hub. Distroless is the
  next step once the health check is rewritten to run under `node` without a shell (see "Later").
- **Runs as** the unprivileged `node` user. No shell is needed at run time; `wget` stays only for
  the health check until distroless.
- **Defaults to demo mode.** `STEWARD_DATA_MODE=demo`, no credential, nothing persisted. Live mode
  is `-e STEWARD_DATA_MODE=live -e DECIONIS_API_BASE_URL=…`; the process refuses to start in live
  mode without a base URL rather than degrading.
- **Ships `public/`**, which the current Dockerfile does not copy; `/llms.txt` lives there.
- **OCI labels**: `source`, `title`, `description`, `licenses`, `version`, `revision`, `created`,
  so registries and scanners describe the image correctly.
- **Health**: `HEALTHCHECK` against `/api/health`, which the session middleware exempts.
- **Platforms**: `linux/amd64` and `linux/arm64`. Install and build stages run on the builder's
  platform; only the runtime stage is per platform.
- **Tags**: `<version>` (immutable, the one to run in production), `<major>.<minor>`, `<major>`,
  `latest` (a stable release), and `edge` (every push to `master`, for people who want tomorrow's
  build today and accept that it moves). A prerelease version gets only its exact tag.
- **Provenance**: BuildKit attaches an SBOM and SLSA provenance to the manifest; the workflow then
  attests the manifest digest with `actions/attest` and pushes the attestation to the registry.
  Verification is one `gh` command, the same as for the tarball.
- **Smoke test before publish**: the built image is started, `/api/health` must answer,
  `/api/steward/portfolio` must report `dataStatus: DEMO`, `/llms.txt` must serve with the right
  first line, and every security header must be present. A release whose image cannot start is not
  a release.

## Machine discovery

`llms.txt` is the concise map and `llms-full.txt` its superset that embeds it verbatim; both follow
the [llms.txt](https://llmstxt.org/) shape: an H1, a blockquote summary, H2 link lists with a note
per link, and an `Optional` section for what an agent can skip. Steward differs from AgentSafe in
one way: Steward is a running web application, so the files are served by it at `/llms.txt` and
`/llms-full.txt` in every data mode, from the container, the tarball and the Vercel demo alike.
The canonical copies live in `public/`; byte-identical copies sit at the repository root so GitHub
readers and raw URLs find them, and the discovery gate fails if the pairs drift.

Two exemptions make that work in live mode. The session middleware lets the two paths through
without a Decionis session, as it does `/api/health` and `/sign-in`, so a prospective adopter's
agent can read them before anyone signs in. And the `X-Robots-Tag: noindex` the app sets on every
response, correct for an operator console, is overridden to `all` on those two paths only: the
console stays out of search engines, the description of it does not.

The discovery rules carried over from AgentSafe: verify before claiming, absolute public links,
no figure without a checked-in measurement, no surface (OpenAPI, MCP, security.txt) unless it
exists, and a script that checks the pairs and every link, weekly, because links rot without
anyone touching the repository.

## The commercial boundary

Stated in full in [OpenCore.md](../OpenCore.md). The short version:

| Free, forever, in this repository                                                                                      | Paid, operated by Decionis, not in this repository                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The whole operator tier: dashboard, queue, account detail, the review flow, every screen                               | Policy evaluation and the `customer_ops` policy pack, with versions                 |
| Demo mode: deterministic fixtures, no account, no credential, nothing persisted                                        | Execution grants: the review that actually changes a processing limit               |
| Live mode against a Decionis workspace in shadow: real evidence, real recommendations, reviews recorded, dossiers read | Decision Dossier retention, the audit ledger, export                                |
| The image, the tarball, the source, the contracts in `domain/`, the tests that prove the boundary                      | Connectors at scale, identity resolution, SSO and SCIM, Presence-verified approvals |
| Machine discovery, documentation, the threat model, the evidence pack                                                  | Support, SLAs, hosted Steward for tenants who do not want to run the container      |

**The activation point.** Commerce enters the flow at exactly one place, and it is not in this
repository: the first review that is meant to execute. Everything up to that line is free, because
everything up to it is Steward doing what Steward does, which is render evidence and forward a
review. The caption on every review control already says it: "Records a review only; no downstream
limit is changed." That sentence is the free tier. The paid tier is the platform making the change.

The flow an adopter walks, and where each step sits:

1. `docker run ghcr.io/decionis/steward` — free, no account, demo evidence. Five minutes.
2. "Connect your platform" in the shell — a link to the Decionis sign-in handoff. Still free: it
   provisions a workspace that decides in shadow, the same way AgentSafe's `login --provision` does.
3. Live mode in shadow — real accounts, real evidence, reviews recorded, dossiers readable. Free.
   This is where an adopter learns whether the recommendations are worth acting on.
4. Enforcement — the tenant moves to a plan; approved reviews execute under grants. Paid. Steward
   renders the same screens; the platform returns `COMPLETED` decisions with outcomes.

What Steward commits never to do, so the boundary stays honest: no license key, no plan check, no
entitlement read, no telemetry, no phone-home, no feature that only lights up for a paying tenant
because of code in this repository. If a screen shows something only paying tenants have, it is
because the platform returned it.

## Workstreams

Each is one pull request off `master`, passes `pnpm verify`, is signed off, and adds a changelog
line.

#### D0 — This plan and the open-core boundary (documentation)

`docs/Distribution.md`, `OpenCore.md`, a README pointer. No code.

#### D1 — The image and the registries

- `Dockerfile`: digest-pinned base from the AWS public mirror, `--platform=$BUILDPLATFORM` on the
  install and build stages, `COPY public/`, OCI labels via build args, unchanged runtime user and
  health check.
- `.github/workflows/image.yml`: on a `v*` tag, and by dispatch with `dry_run`, verify the tree,
  build multi-arch with SBOM and provenance, smoke-test the `linux/amd64` image locally, push to
  GHCR with the tag set above, attest the digest, then call `dockerhub.yml` when
  `DOCKERHUB_PUBLISH_ENABLED` is `true`. On every push to `master`, the same build pushes only
  `edge`.
- `.github/workflows/dockerhub.yml`: AgentSafe's copy-by-digest workflow, adapted to this
  repository's names, publishing `packaging/dockerhub/README.md` as the Hub overview.
- `packaging/dockerhub/README.md` and `docs/Docker.md`: how to run it, demo and live, how to
  verify it, what the tags mean, why to mirror before a cluster pulls.
- `.github/dependabot.yml`: the `docker` ecosystem, monthly, so the base image digest moves on
  purpose.
- `.dockerignore`: keep tests and docs images out of the context.

Gate: a dry-run dispatch builds, smoke-tests and attests without publishing. Then the next
release tag publishes for real.

#### D2 — Machine discovery

- `public/llms.txt`, `public/llms-full.txt`; root copies; `scripts/CheckDiscovery.mjs` (pairs
  identical, structure valid, local links exist, public links resolve on an allowlist of hosts);
  `pnpm discovery` in `verify`; `.github/workflows/discovery.yml` weekly and on pull requests.
- `middleware.ts`: the two paths join the unauthenticated set; `middleware.test.ts` proves it.
- `next.config.ts`: the two paths get `X-Robots-Tag: all`; a test asserts the override.
- `docs/Discovery.md`: the rules, in this repository's words.

Depends on D1's `COPY public/` for the container to serve the files; the tarball and Vercel
already ship `public/`.

#### D3 — The activation point in the product

- The app shell's demo badge gains "Connect your platform", a link to the sign-in handoff.
- The sign-in page says what is free and what is paid, in two sentences, with a link to
  `OpenCore.md`, so the line is stated where an adopter meets it.
- No entitlement logic, no plan check. Presentation only.

#### D4 — Documentation and evidence

- README: an "Install" section in AgentSafe's shape (Docker, tarball, source, hosted demo), the
  image verification command, and the free/paid line.
- `EvidencePack.md`: rows for image provenance, base-image pinning, and the no-telemetry boundary
  restated for the container.
- `ThreatModel.md`: the container as a deployment surface; what the image does and does not hold.

## Sequencing

| Stage                 | Work       | Gate                                                                                           |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| **0. Record**         | D0         | Merged; the boundary is written before any channel that exposes it                             |
| **1. Ship the image** | D1         | Dry-run dispatch green: built, smoke-tested, attested. Then `v0.2.1` or the next tag publishes |
| **2. Be found**       | D2, D3     | `/llms.txt` serves from the container and the demo; the shell links to the handoff             |
| **3. Say so**         | D4         | README and evidence pack describe what exists, verified against the registries                 |
| **4. Mirror**         | Docker Hub | Secrets set, `DOCKERHUB_PUBLISH_ENABLED=true`, the Hub digest equals the GHCR digest           |

D1 and D2 can run in parallel as branches; D2's container path only works once D1 has merged.

## Inputs needed

| Input                                                      | Needed for                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Repository secrets `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | The Docker Hub mirror. The same account that owns `decionis/agentsafe` on the Hub               |
| Repository variable `DOCKERHUB_PUBLISH_ENABLED=true`       | Turning the mirror on; absent or `false`, GHCR alone publishes                                  |
| GHCR package visibility                                    | The first push creates the package; confirm it is public and linked to this repository          |
| A decision on distroless                                   | Hardening; needs the health check rewritten to run under `node` without a shell                 |
| A decision on `edge`                                       | Whether a moving tag from `master` is wanted at all; the plan says yes, `latest` stays releases |

## Later, deliberately

- **Distroless runtime** under Node's permission model, as AgentSafe runs. Worth doing; needs the
  health check and a read-only root filesystem proven first.
- **Helm chart** on `oci://ghcr.io/decionis/charts/steward`. A web tier with one Deployment and one
  Service is small; do it when a cluster asks.
- **Hosted Steward** for tenants who do not want to run the container: the same image behind a
  Decionis-operated listener. That is a platform product, not a repository change.
- **A self-hosted control plane** with an NGINX Plus-style license file and usage reporting. If
  Decionis ever ships one, Steward does not change; the platform does.
- **Homebrew, `.deb`, `.rpm`, a single executable**: right for a gateway, wrong for a web tier.
