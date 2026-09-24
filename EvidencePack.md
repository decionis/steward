# Evidence Pack

The artifact index for a security review of Steward.

Written primarily for **the person adopting it**. If you want to run Steward inside a bank, a utility,
or an insurer, your own security team will ask most of the questions below, and this is the set of
links that answers them — things they can read and run rather than a meeting they have to schedule.

It answers the same questions when someone is reviewing Decionis as a vendor. That is a by-product of
being honest about the boundary, not the reason this document exists.

Everything here is public in this repository. None of it requires a call, an NDA, or a screen share.

## The one-paragraph answer

Decionis Steward is the operator-facing tier of the Decionis platform. It collects signals from the operator's own
systems, renders customer evidence and forwards operator reviews; it does **not** own identity
resolution, the weighing of signals, policy evaluation, execution grants, Decision Dossiers, or the
audit ledger. It has no database, no session store, and no
customer data at rest. Because the tier is non-authoritative by construction, its source is public
under Apache-2.0 — a reviewer can verify the trust boundary rather than take our word for it.

## Answering the questionnaire

| They ask                                     | Send                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Licensing and patent terms                   | [LICENSE](./LICENSE) (Apache-2.0), [NOTICE](./NOTICE)                                          |
| Third-party components and their licenses    | [ThirdPartyLicenses.md](./ThirdPartyLicenses.md) — all 25 production packages, by license      |
| Copyleft or reciprocal obligations           | Same file, "Notes on non-permissive licenses" — the LGPL and CC-BY entries answered in advance |
| Known vulnerabilities in the dependency tree | [audit.yml](.github/workflows/audit.yml) — blocking on every PR plus weekly                    |
| SBOM                                         | CycloneDX JSON attached to each GitHub release by [release.yml](.github/workflows/release.yml) |
| Build integrity / artifact provenance        | Signed SLSA attestation per release and per image; verify with the commands below              |
| Vulnerability disclosure process and SLA     | [SECURITY.md](./SECURITY.md)                                                                   |
| Architecture and data flow                   | [Architecture.md](./Architecture.md)                                                           |
| Threat model and residual risk               | [ThreatModel.md](./ThreatModel.md)                                                             |
| Data handling, telemetry, data residency     | [ThreatModel.md](./ThreatModel.md), "Data handling"                                            |
| Secure development practice                  | [CONTRIBUTING.md](./CONTRIBUTING.md), [CODEOWNERS](.github/CODEOWNERS)                         |
| **"Prove the boundary is real"**             | The table below                                                                                |

## Proving the boundary

Most vendors answer this with a diagram. This one answers it with source a reviewer can read and
tests they can run.

| Control                                          | Implemented in                                                                | Proven by                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------- |
| Every request requires a Decionis session        | [middleware.ts](middleware.ts)                                                | `middleware.test.ts`             |
| API returns 401 rather than redirecting to HTML  | [middleware.ts](middleware.ts)                                                | `middleware.test.ts`             |
| Role claims parse defensively; floor is `VIEWER` | [StewardSessionResolver.ts](infra/auth/StewardSessionResolver.ts)             | `StewardSessionResolver.test.ts` |
| Reviews require `APPROVER` or `ADMIN`            | [OpportunityService.ts](application/opportunities/OpportunityService.ts)      | `OpportunityService.test.ts`     |
| Credential never appears in a URL                | [JsonHttpClient.ts](infra/api/JsonHttpClient.ts)                              | `JsonHttpClient.test.ts`         |
| Token never crosses into client-side code        | Server-component boundary                                                     | `ServerClientBoundary.test.ts`   |
| Upstream responses validated before use          | [domain/](domain/) Zod contracts                                              | `JsonHttpClient.test.ts`         |
| No fixture fallback on live failure              | [StewardRepositoryFactory.ts](infra/repositories/StewardRepositoryFactory.ts) | `DemoStewardRepository.test.ts`  |
| Errors disclose no internal detail               | [StewardApiErrorMapper.ts](infra/api/StewardApiErrorMapper.ts)                | `StewardApiErrorMapper.test.ts`  |
| The image is what the workflow built             | [image.yml](.github/workflows/image.yml), digest attested                     | `gh attestation verify oci://…`  |
| The image's base cannot drift silently           | [Dockerfile](Dockerfile), digest-pinned base                                  | Dependabot, in a PR of its own   |
| The image is smoke-tested before it is pushed    | [image.yml](.github/workflows/image.yml), both platforms                      | The run's log, per platform      |

A reviewer can run the whole suite in under a minute, with no credentials:

```bash
pnpm install
pnpm test
```

## Things a reviewer can run

```bash
# The full gate CI runs: format, lint, typecheck, tests, production build
pnpm verify

# No known vulnerabilities in the production dependency tree
pnpm audit --prod

# ...nor any high or critical in the build toolchain
pnpm audit --audit-level high

# Every production dependency within the approved license set
pnpm licenses:check

# The complete third-party inventory, regenerated from the lockfile
pnpm licenses:list
```

Verifying a release artifact came from this source and not from someone's laptop:

```bash
gh attestation verify decionis-steward-<version>.tar.gz --repo decionis/steward
```

The same for the image, on either registry; the two `inspect` digests are equal for every version:

```bash
gh attestation verify oci://ghcr.io/decionis/steward:<version> --repo decionis/steward
docker buildx imagetools inspect ghcr.io/decionis/steward:<version>
```

## Running it without credentials

The application boots against deterministic fixtures. A reviewer can exercise the entire operator
workflow — including submitting a review — without a Decionis tenant, an account, or a key:

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Demo mode is explicit and visible: the interface carries a `DEMO EVIDENCE` badge, and every review
control is captioned "Records a review only; no downstream limit is changed."

## Fast answers to common questionnaire rows

| Row                                     | Answer                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer data at rest in this component | **None.** No database, no cache, no session store.                                                                                                                                                               |
| Telemetry or analytics                  | **None.** No third-party scripts; no outbound request except the Decionis API and the signal sources the deployment configures.                                                                                  |
| Cookies set by this component           | **None.** Session cookies come from the Decionis identity handoff; Steward reads them.                                                                                                                           |
| PII in URLs                             | **No.** Account identifiers are opaque references.                                                                                                                                                               |
| Secrets in this repository              | **None.** No credential or key is in the tree; signal-source credentials are mounted at run time, per deployment.                                                                                                |
| Systems this tier reaches               | The configured Decionis platform, and each signal source the deployment configures; connectors under `infra/connectors/` parse, forward and discard. See [docs/SignalConnectors.md](./docs/SignalConnectors.md). |
| Sub-processors introduced by this tier  | **None.**                                                                                                                                                                                                        |
| Security headers                        | Seven set globally — tabulated in [ThreatModel.md](./ThreatModel.md).                                                                                                                                            |
| Content-Security-Policy                 | **Yes**, nonce-based, per request, no `unsafe-inline`/`unsafe-eval` on scripts.                                                                                                                                  |
| Penetration test report                 | **Not yet commissioned.**                                                                                                                                                                                        |
| SOC 2 / ISO 27001                       | Certifications belong to the Decionis platform, not to this repository.                                                                                                                                          |
| Rate limiting in this tier              | **None.** Expected at the edge or upstream.                                                                                                                                                                      |
| Container image                         | `ghcr.io/decionis/steward`, two architectures, non-root, attested; Docker Hub by digest                                                                                                                          |
| License checks or usage reporting       | **None.** The image is the same bytes for a free tenant and a paying one; see [OpenCore.md](./OpenCore.md).                                                                                                      |

The last three are deliberately in this table. A reviewer finds gaps faster than we can hide them,
and a vendor that states its own weak spots is easier to trust on the rest.

## What is out of scope for this repository

Route these to the Decionis platform, not here:

- Policy evaluation and the `customer_ops` policy pack
- Identity resolution and the weighing of signals
- Execution grants, Decision Dossiers, the audit ledger
- Platform certifications, uptime commitments, and data-residency guarantees

[SECURITY.md](./SECURITY.md) says the same thing to security researchers, so a misrouted report gets
redirected rather than dropped.
