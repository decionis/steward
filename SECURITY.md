# Security Policy

Decionis Steward is the operator-facing tier of a platform used in regulated enterprise operations. We treat
reports against it seriously and would rather hear about a suspected issue that turns out to be
nothing than not hear about a real one.

## Reporting a vulnerability

**Do not open a public issue, pull request, or discussion for a suspected vulnerability.**

Report privately through
**[GitHub Security Advisories](https://github.com/decionis/steward/security/advisories/new)** — the
"Report a vulnerability" button on this repository's Security tab. It keeps the report, our
questions, and any fix coordination in one private thread until a fix ships.

If you cannot use GitHub Security Advisories, email **security@decionis.com**.

A useful report includes:

- The affected version or commit, and whether you observed it in `demo` or `live` data mode.
- What an attacker gains — read access to another organization's data, an unauthorized review, a
  bypassed role check.
- Reproduction steps, ideally against a local `pnpm dev` instance.
- Any proof-of-concept you are willing to share.

You do not need a working exploit. A clear description of the flawed logic is enough.

## What to expect

| Stage                                          | Target           |
| ---------------------------------------------- | ---------------- |
| Acknowledgement that we received it            | 2 business days  |
| Initial assessment and severity                | 5 business days  |
| Fix or documented mitigation for high/critical | 30 calendar days |
| Fix or documented mitigation for low/medium    | 90 calendar days |

We will keep you updated if a fix takes longer than the target, tell you plainly if we assess the
report as out of scope or as accepted risk, and credit you in the advisory unless you prefer
otherwise. We do not currently operate a paid bounty programme.

## Scope

**In scope — report here:**

- Anything in this repository: the Next.js application, the BFF routes under `app/api/`, the session
  middleware, role enforcement, the signal connectors, and the upstream gateway client.
- Authentication or authorization bypass, cross-organization data exposure, credential leakage into
  client-side code or logs, injection, and dependency vulnerabilities reachable from this codebase.

**Out of scope — report to <security@decionis.com> instead**, which is also the platform security
contact. Say which system you were testing so it reaches the right team:

- The Decionis platform APIs under `/v1/cdi`, policy evaluation, the `customer_ops` policy pack,
  identity resolution, execution grants, Decision Dossiers, and the audit ledger. **Steward does not
  own any of these** — see [ThreatModel.md](./ThreatModel.md) for the boundary.
- Findings against a Decionis-operated deployment rather than this source code.

**Not accepted as vulnerabilities:**

- The demo operator's `ADMIN` and `APPROVER` roles. Demo mode is a credential-free fixture mode,
  deliberately privileged so the review flow is exercisable; `StewardRuntimeConfig` defaults production
  to live mode. A report that demo mode grants admin rights describes intended behaviour. A report
  that demo mode can be _reached_ in a production configuration is in scope and serious.
- Missing security headers already documented as accepted risk in
  [ThreatModel.md](./ThreatModel.md), unless you can demonstrate concrete impact.
- Output from an automated scanner with no analysis of reachability in this codebase.

## Supported versions

This project is pre-1.0 and under active development. Only the latest commit on `master` is
supported; there are no maintained release branches and no backports. Fixes ship forward.

| Version           | Supported |
| ----------------- | --------- |
| `master` (latest) | ✅        |
| Older commits     | ❌        |

## Our own supply chain

Every pull request runs `pnpm audit --prod` and a license policy check, and both run again weekly
against the unchanged tree so an advisory published after merge still surfaces. See
[OpenSource.md](./OpenSource.md) for the full posture and
[ThirdPartyLicenses.md](./ThirdPartyLicenses.md) for the current dependency inventory.

If you find that a dependency advisory is reachable in this codebase in a way the audit does not
catch, that is worth reporting — the audit tells us a vulnerable version is present, not that it is
exploitable here.
