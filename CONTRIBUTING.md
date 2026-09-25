# Contributing to Decionis Steward

Thanks for considering a contribution. This document covers what you need to get running, what the
review gate is, and — most importantly — the one class of change this project will not accept.

## Before you start: what Steward is not

**Steward is not authoritative.** It collects signals from the operator's own systems, renders account
evidence and forwards operator reviews to the Decionis platform, which owns identity resolution, the
weighing of signals, policy evaluation, execution grants, Decision Dossiers, and the audit ledger.

That boundary is the product. Changes that move decision authority into this repository will be
declined regardless of how well they are implemented:

- Evaluating policy locally instead of forwarding to the platform.
- Persisting the content of customer evidence or of a collected signal. Steward keeps its own
  records (users, sessions, the workspace connection, sources, decisions, reviews, activities) in
  the operator's database through portable migrations under `infra/persistence/migrations/`; a
  signal's title, detail or values never go into a table, and a migration that only one dialect
  can run will be declined.
- Falling back to demo fixtures when a live API call fails. Showing an operator fabricated data
  during a regulated decision is a defect, not resilience.
- Treating Steward's own role check as the security control. It is a UX affordance; the platform
  re-authorizes every review.
- Adding telemetry, analytics, or an outbound request to any host other than the configured platform
  and the signal sources a deployment configures. A connector lives under `infra/connectors/`, reaches
  only the host its source names, parses what comes back through `CapturedSignal`, and stores nothing;
  [docs/SignalConnectors.md](./docs/SignalConnectors.md) is the plan for adding one.

If you think one of these is genuinely needed, **open an issue first**. It is a design conversation,
not a pull request. [ThreatModel.md](./ThreatModel.md) explains why each rule exists.

Everything else — UI, accessibility, error and empty states, documentation, tests, deployment
recipes, formatting edge cases — is welcome without asking first.

## Getting set up

You need **Node >= 20** and **pnpm 9**. No Decionis credentials are required.

```bash
git clone https://github.com/decionis/steward.git
cd steward
cp .env.example .env.local
pnpm install
pnpm dev
```

Open <http://localhost:3000>. You are signed in as a fixture operator with `ADMIN` and `APPROVER`
roles against deterministic demo data, so the full review flow works end to end. Nothing is persisted
and no downstream action is executed.

Demo mode is the normal development mode. You should not need live credentials to work on anything in
this repository.

## The gate

```bash
pnpm verify
```

That runs format, lint, typecheck, tests, and a production build — the same thing CI runs on Node 20
and 22. **A green local `pnpm verify` means a green CI run.** Run it before you open a pull request.

Three further checks run in CI and are worth running locally if you touch dependencies:

```bash
pnpm audit --prod            # production tree: any severity fails
pnpm audit --audit-level high # whole tree incl. dev: high and critical fail
pnpm licenses:check          # every production dependency within the approved license set
```

The two audits have different thresholds on purpose. The production tree is what ships, so anything
there fails. Dev dependencies are not redistributed, but they execute on the CI runner with access to
the token and the source — so high and critical still block, while moderate churn in tooling does
not, because a gate that fires constantly is a gate people learn to ignore.

### Adding a dependency

Production dependencies must carry a license in the approved set. If yours does not,
`pnpm licenses:check` fails with the offending package named. Resolve it by choosing a different
dependency, or — if there is a real reason — by adding a package-scoped exception in
[scripts/CheckLicensePolicy.mjs](scripts/CheckLicensePolicy.mjs) **and** recording the rationale in
[ThirdPartyLicenses.md](./ThirdPartyLicenses.md). Do not widen the blanket allowlist to get a build
passing.

Commit the lockfile with your change. CI installs with `--frozen-lockfile` and will fail without it.

## Conventions

- **PascalCase for feature and domain files** — `AccountService.ts`, `CustomerOpportunity.ts`.
  Framework- and ecosystem-required files keep their own naming: `page.tsx`, `layout.tsx`,
  `route.ts`, `middleware.ts`, directory segments, GitHub workflows, and the community health files
  (`README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`).
- **camelCase** for variables, properties, and methods.
- **Classes and interfaces over loose utility functions.** One reason to change per module.
- Full rules in [coding.rule.md](./coding.rule.md); layer boundaries in
  [Architecture.md](./Architecture.md).

### The pre-commit hook

`pnpm install` points `core.hooksPath` at [`.githooks/`](.githooks), so a pre-commit hook checks two
things on the files you staged:

- **Formatting** — Prettier, including Markdown.
- **Markdown links** — every relative link resolves to a file that exists.

It **checks rather than fixes**. Reformatting mid-commit would rewrite content you did not stage, and
with a partially staged file it would commit a version nobody reviewed. When it fails it tells you
the command to run:

```bash
pnpm format:fix
pnpm links:check
```

It is a native git hook rather than husky — no extra dependency and no postinstall script, just a
shell script you can read. `git commit --no-verify` bypasses it; both checks also run in CI, which
you cannot bypass. The hook exists to catch these in two seconds rather than two minutes.

### Screenshots

If your change alters what the interface looks like, regenerate the README images in the same pull
request:

```bash
pnpm build
STEWARD_DATA_MODE=demo pnpm start        # one terminal
pnpm screenshots                     # another
```

The script refuses to run unless the server reports `dataStatus: DEMO` — these images are published,
and live mode would put real customer names and processing limits in them. It uses Playwright's
bundled Chromium, falling back to system Chrome where that download is unavailable.

### Tests

Tests sit next to the code they cover, named `X.test.ts`. Server-side tests need a docblock:

```ts
/**
 * @vitest-environment node
 */
```

The default environment is jsdom, which does not provide the Web APIs `next/server` needs.

If you change anything under `middleware.ts`, `infra/auth/`, or `infra/api/`, your change needs test
coverage. These are the files that enforce the trust boundary, and an untested authorization path is
the thing this project least wants to ship. Ask yourself whether your test would actually fail if the
behaviour regressed — a test that cannot fail is worse than none on these paths.

## Pull requests

1. Branch from `master`.
2. Keep the change focused. A PR that does one thing gets reviewed quickly.
3. Run `pnpm verify`.
4. Write a description that explains **why**, not just what. The diff shows what.
5. Changes under `domain/`, `infra/auth/`, `infra/api/`, or `middleware.ts` require review from a
   code owner — these encode the trust boundary and do not merge on a drive-by approval.

### Sign your commits (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/). It is a
statement that you wrote the contribution or otherwise have the right to submit it under the
project's license. Add a sign-off line with `-s`:

```bash
git commit -s -m "Fix evidence coverage rounding"
```

That appends `Signed-off-by: Your Name <your@email.com>` using your git config. There is no CLA.

### Commit messages

Present tense, imperative mood, explaining why where it is not obvious:

```text
Reject a role claim that parses to an empty set

An empty roles array read as "no restrictions" in the review gate rather
than as "no privileges". Falls back to VIEWER instead.
```

## Licensing of contributions

Decionis Steward is licensed under [Apache-2.0](./LICENSE). Per section 5 of that license, any
contribution you intentionally submit for inclusion is licensed under the same terms, without any
additional conditions. Your DCO sign-off is your confirmation that you have the right to do so.

## Reporting a vulnerability

**Do not open a public issue.** See [SECURITY.md](./SECURITY.md) for the private disclosure process.

## Code of conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).
