# Changelog

All notable changes to Decionis Steward are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Pre-1.0 stability:** contracts in `domain/` may change without a deprecation period until the first
`1.0.0` release. Treat a minor version bump before 1.0 as potentially breaking, and pin exactly if
you integrate against these types.

## [Unreleased]

The next release is **0.2.0**. Contracts in `domain/` gained optional fields (`contextClass` on
evidence, `arbitration` on opportunities), which the pre-1.0 policy above treats as potentially
breaking, so this is a minor bump rather than a patch.

### Added

- [docs/ContextEngineering.md](./docs/ContextEngineering.md): a review of two September 2026 articles
  on context engineering and operational readiness, a map of their framework onto Steward's contracts
  and trust boundary, and the approved plan for making the platform's decisions more legible at
  review time. [Architecture.md](./Architecture.md) gains a section naming the
  sense-interpret-arbitrate-act loop that `AccountTimelineEvent.kind` already records.
- Evidence carries an optional `contextClass` (`JOURNEY`, `INTENT`, `FRICTION`, `OPERATIONAL`,
  `POLICY`): what kind of situation a signal describes, alongside the existing `category`, which
  says where it came from. The account evidence panel shows the class when the platform supplies it
  and nothing when it does not; Steward never infers it. Every demo signal is classified. Workstream
  W1 of the context-engineering plan in `docs/ContextEngineering.md` (its own pull request).
- Inaction is a first-class decision in the interface. The demo carries a `NO_ACTION` decision for
  Victor Remit with its evidence, dossier, and a `DECISION` timeline event. The dashboard groups
  `NO_ACTION` and held items under their own heading beneath the queue rather than mixing them into
  "what needs a decision now". The account page now distinguishes "the platform decided no action"
  from "no recommendation was returned", which it previously conflated under a "No action" badge.
  Workstream W3 of the context-engineering plan in `docs/ContextEngineering.md` (its own pull
  request).
- The account page states the context at the moment of review: whether the evidence a
  recommendation links is live, aging, or stale, whether any source that produced it reports
  degraded health, and when the account's evidence was last updated. A confidence badge no longer
  sits above stale evidence from a degraded connector without a word saying so. After a review, the
  interface says if the platform's disposition differs from the one that was on screen.
  `DecisionContext` in `presentation/` summarises fields already on the page and makes no judgment.
  Workstream W4 of the context-engineering plan in `docs/ContextEngineering.md` (its own pull
  request).
- Opportunities carry an optional `arbitration`: which class of context governed the disposition,
  which signals it rested on, which it overrode, what it suppressed, and under which policy version.
  The queue card and the account decision panel render it as "Why this disposition". Steward renders
  the object the platform sends and never computes one; a `BLOCK` without `arbitration` looks as it
  did before. The three open demo recommendations explain themselves, and the fixture tests require
  it. Workstream W2 of the context-engineering plan in `docs/ContextEngineering.md` (its own pull
  request).
- The account evidence panel shows a context-coverage strip for the open recommendation: which of
  the five context classes its linked evidence covers, filled when live or current, hollow when
  only aging or stale, dashed when absent. "87% evidence coverage" could not say that no
  operational signal backs an expansion; this can. It renders only when every linked signal carries
  a class, so an upstream that has not shipped classes sees no change. Workstream W5 of the
  context-engineering plan in `docs/ContextEngineering.md` (its own pull request).
- The loop is closed on screen. The dashboard lists completed decisions under "Recently resolved",
  read-only with their dossier references, beneath the queue; the queue itself no longer carries
  them. The account timeline marks `OUTCOME` events distinctly, and the account page shows the open
  recommendation rather than whichever came first. The demo carries the prior limit review that set
  Kilo Payments' current envelope, completed, with its outcome event. Workstream W6 of the
  context-engineering plan in `docs/ContextEngineering.md` (its own pull request).

### Changed

- **Contract:** `EvidenceSignal` in `domain/` gained the optional `contextClass` field. The platform
  ships it as a versioned CDI contract change, and the Steward release that carries it is a minor
  bump under the pre-1.0 policy above.
- **Contract:** `CustomerOpportunity` in `domain/` gained the optional `arbitration` object. The platform ships it as a versioned CDI contract change, and the Steward release that carries it is a minor bump under the pre-1.0 policy above.

### Security

- `next` 16.3.1 → 16.3.6 (range `^16.3.3`), clearing two critical advisories in the Image Optimization API
  (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4). The `sharp` forward pin moves to `^0.35.4`
  (GHSA-rgj7-g3m4-5g8c, libheif) and the `js-yaml` pin to `^4.3.2` (GHSA-2883-xcg3-v3hh, dev tree
  only). The audit gate had been red on `master` since 14 September 2026 on the unchanged tree,
  which is the case the weekly run exists to catch; every open pull request inherited the failure.

## [0.1.2] — 2026-08-15

The application is unchanged. This release exists so the provenance attestation ships as a release
asset rather than living only in GitHub's attestation store.

### Added

- The Sigstore bundle for the build-provenance attestation is attached to each release as
  `decionis-steward-<version>.sigstore.json`, so a release can be verified from the downloaded files
  alone:

  ```bash
  gh attestation verify decionis-steward-0.1.2.tar.gz \
    --bundle decionis-steward-0.1.2.sigstore.json --repo decionis/steward
  ```

  That matters for an air-gapped or mirrored consumer, and for anyone archiving a release rather than
  fetching it live. The same bundle has been backfilled onto `v0.1.1`.

### Notes

- OpenSSF Scorecard's `Signed-Releases` check scored this repository 0 while the provenance was real
  but unpublished. That score was correct: the check inspects release assets, and there were none to
  find. It is the gap that prompted this release rather than the reason for it — the offline
  verification path is worth having on its own.

## [0.1.1] — 2026-08-15

Supersedes 0.1.0, whose SBOM asset was unusable. The application itself is unchanged; 0.1.0's tarball
and its provenance attestation remain valid, and 0.1.0 is left published rather than retracted so
that anything already referencing it still resolves.

### Fixed

- **The release SBOM described nothing.** 0.1.0 shipped a 419-byte CycloneDX document with zero
  components: valid JSON, valid schema, correct filename, and no answer to any question a reviewer
  would ask it. It is now generated from `pnpm licenses list --prod` by
  [`scripts/GenerateSbom.mjs`](./scripts/GenerateSbom.mjs) — the same source
  [`ThirdPartyLicenses.md`](./ThirdPartyLicenses.md) is generated from, so the SBOM and the published
  inventory cannot disagree. Also available locally as `pnpm sbom`.
- The release now fails if the SBOM contains fewer than five components. The empty one passed every
  check that existed and was caught only by opening the file.

### Changed

- `anchore/sbom-action` is no longer used, removing a third-party action from the release path.

## [0.1.0] — 2026-08-15

First tagged release. The application itself — demo and live data modes, the portfolio dashboard, the
opportunity review queue, and account evidence detail — was already built; this release is where it
became something that can be handed to someone outside the team.

### Added

- Apache-2.0 licensing: `LICENSE`, `NOTICE`, and complete `package.json` metadata. The missing
  `license` field had been reported by SCA tooling as "license unknown".
- `ThirdPartyLicenses.md` — inventory of every production dependency by license, with the LGPL and
  CC-BY entries explained rather than left for a reviewer to derive.
- `scripts/CheckLicensePolicy.mjs` and `pnpm licenses:check` — fails the build on a production
  dependency outside the approved license set.
- CI: `pnpm verify` on Node 20 and 22; a supply-chain gate running `pnpm audit --prod`,
  `pnpm audit --audit-level high` and the license policy on every pull request and weekly; CodeQL;
  OpenSSF Scorecard.
- Release pipeline producing a deployable tarball, a CycloneDX SBOM generated from the assembled
  bundle, and a signed SLSA build-provenance attestation.
- Nonce-based Content-Security-Policy, applied by `middleware.ts` to every response in both data
  modes and to refusals as well as successes.
- Test coverage for the security-critical paths — session middleware, session and role resolution,
  the upstream HTTP client, API error mapping, and the server/client component boundary. 11 tests
  became 79.
- `SECURITY.md`, `ThreatModel.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, and issue
  and pull request templates.
- `EvidencePack.md` — the artifact index for a vendor security review.
- `PublicLaunch.md` — the ordered runbook for making the repository public.
- `Dockerfile` and `.dockerignore` — multi-stage, non-root, with a health check.
- `.github/dependabot.yml` — grouped weekly updates for npm and GitHub Actions. Dependabot had been
  running unconfigured, which produced four consecutive failed security-update jobs.
- README screenshots, and `pnpm screenshots` to regenerate them from a running instance.

### Changed

- `next` to `15.5.23`, with `pnpm.overrides` pinning `postcss`, `nanoid`, and `sharp` above their
  vulnerable ranges. These are forward pins to patched releases, not version freezes; remove each once
  the upstream `next` range resolves past it on its own.
- README rewritten for an audience evaluating the project rather than one already inside it.
- `/sign-in` is now matched by the session middleware. It had been excluded to avoid a redirect loop,
  which also left the one page every unauthenticated visitor reaches without a security policy.
- The OpenSSF Scorecard workflow is manual-only until the repository is public; its GraphQL queries
  are unavailable to the default token on a private repository.

### Removed

- `@decionis-ai/sdk` — declared as a dependency but imported by no source file.

### Security

- Resolved 15 known advisories in the production dependency tree (8 high, 7 moderate), all reachable
  through `next` and its transitive dependencies.
- Resolved 10 advisories in the development tree (1 critical, 6 high, 3 moderate) — `vitest` to 3.x
  and subsequently 4.x, plus overrides pinning `vite`, `esbuild`, `js-yaml`, and `brace-expansion`.
- The CI audit gate now covers the build toolchain as well as the production tree, at high and
  critical severity. Auditing production only had been hiding a critical in the test runner.
- `gitleaks` across all refs reports no secrets in git history. Only `.env.example` was ever
  committed, and its service-token field is empty.

[unreleased]: https://github.com/decionis/steward/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/decionis/steward/releases/tag/v0.1.2
[0.1.1]: https://github.com/decionis/steward/releases/tag/v0.1.1
[0.1.0]: https://github.com/decionis/steward/releases/tag/v0.1.0
