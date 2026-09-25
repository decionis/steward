# Steward on the published Protocol

**Status: decided 25 September 2026; the owner's decisions are recorded below, and the work begins with C1.** Steward is a third-party application
built on the Decionis Protocol. For policy evaluations and for signals it uses the API contracts
published at [docs.decionis.com](https://docs.decionis.com/), whose machine-readable form is the
OpenAPI document at `https://decionis.com/.well-known/openapi.json` ("Decionis Policy Evaluation
API", 0.5.0). It asks the Protocol for nothing of its own. This document maps every screen and
every contract in `domain/` onto the published operations, names what leaves the tree as a result,
lists the decisions the mapping needs, and sequences the work.

## The rule

> Steward should reuse existing protocol API. Think of Steward as a third app built on the
> protocol. "Reuse the published API" means, for policy evaluations and signals, it uses the API
> contracts published on https://docs.decionis.com/.

Two consequences follow. First, the four `/v1/cdi` operations Steward's live mode speaks today
(`infra/api/DecionisStewardGateway.ts`) are published nowhere; they are a private contract, and
they go. Second, the "upstream requests" in [docs/ContextEngineering.md](./ContextEngineering.md)
and [docs/ProactiveSupport.md](./ProactiveSupport.md) are withdrawn: what they asked for is either
already published in another shape or is Steward's own work over data Steward collects.

Where an operation is both in the OpenAPI document and on a docs page, the OpenAPI is the contract
and `domain/` parses it. Where a docs page publishes an operation the OpenAPI does not carry yet,
the page is the contract and the schema in `domain/` says so in a comment.

## What the Protocol publishes that Steward uses

| Operation                                                       | In OpenAPI | Steward uses it for                                                                                                         |
| --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/protocol/evaluate-decision`                           | yes        | A decision on an account event: the items in the queue. `mode` SHADOW, PARALLEL or ENFORCEMENT                              |
| `GET /v1/protocol/dossiers/{dossier_id}`                        | yes        | The record behind a queue item: "Why this disposition", the signals accepted, the policy snapshot                           |
| `GET /v1/protocol/decision-chains/{chain_id}`, `/by-evaluation` | yes        | The account timeline across related decisions; `evidence_lineage` gives ACTION and OUTCOME                                  |
| `GET /v1/protocol/shadow/evaluate-decision/reports`, `/summary` | yes        | The queue and "Recently resolved" while a workspace runs in shadow; the loop measured                                       |
| `POST /v1/protocol/signals/envelopes`                           | yes        | Forwarding a collected signal, one envelope per `CapturedSignal`, answered with an artifact id                              |
| `POST /v1/protocol/surfaces/decisions`                          | yes        | Recording an operator's review as a surface decision (authorize, block, review) on a dossier, into the ledger               |
| `GET /v1/public/decision-dossiers/{id}/verify`                  | yes        | The "Verify" link beside every dossier reference; no account needed                                                         |
| `POST /v1/public/agents/provision`                              | yes        | "Connect your platform" without an account: a provisional shadow workspace, claimable later                                 |
| `GET /v1/health`                                                | yes        | Live-mode readiness before the first request                                                                                |
| `POST /v1/protocol/overrides`, `/{id}/review`, list routes      | docs page  | Holding a decision for more evidence, and appeals: an override trail with a reviewer outcome, statuses PENDING to CANCELLED |
| `GET /v1/orgs/{orgId}/decision-ledger`                          | docs page  | The organisation-level record behind "Recently resolved" once a workspace enforces                                          |
| `GET /v1/orgs/{orgId}/policies/decision-graph`                  | docs page  | The policy envelope in force on the account page                                                                            |
| `GET /v1/protocol/reason-codes`                                 | docs page  | The vocabulary the queue renders a rationale from                                                                           |
| `POST /v1/signals/webhooks/{connectorId}`                       | docs page  | The provider-event ingress built in #91; kept or retired by decision D2 below                                               |

Everything else in the document (execution grants, claim and finalize, Presence escalations,
policy bundles, UCP checkout, analytics, marketplace routes) is the platform's or another
surface's business and Steward does not call it.

## Where the accounts come from

There are two kinds of account here, and they come from different places.

**The organisation's account** is the Protocol's. The Decionis organisation, its workspace and its
people live on the account surface at `accounts.decionis.com` (the `account-api` service). Steward
creates that account at first boot (C7), signs people in through it when the organisation chooses
the Decionis handoff, and asks it who the caller is (`GET /v1/me`). Steward does not keep a second
copy of it: its own `users` table holds the local accounts the organisation chose to allow and the
subject that links a person to their Decionis account.

**The organisation's customers**, the roster an operator reviews (name, reference, segment,
region, corridors, owner, limit), are not served by the account surface or the Protocol. They are
held in the operator's CRM, ERP and ledger, which [docs/SignalConnectors.md](./SignalConnectors.md)
already decided Steward collects from. So in live mode:

- **The roster** comes from the CRM connector (S4, issue #101), read per request and not stored.
- **The evidence** on an account page is what Steward's connectors collected, shaped as
  `EvidenceSignal` with freshness from `observedAt`, and, once forwarded, carrying the artifact id
  the Protocol returned, so the panel can say "accepted by the platform" per signal.
- **The decisions** come from the Protocol: each account event Steward considers material is
  evaluated with `decision_type` naming the kind Steward already knows
  (`PROCESSING_LIMIT_REVIEW`, `EXPANSION_OUTREACH`, `FRICTION_INTERVENTION`,
  `KYC_KYB_ESCALATION`, `HOLD_FOR_MORE_EVIDENCE`, `NO_ACTION`, and `PROACTIVE_SUPPORT`), the
  account reference as `context.identifier`, and the collected signals as `context`. The
  organisation's rules, owned and versioned by the platform, decide.
- **The account state** (`HEALTHY`, `FRICTION`, `REVIEW_REQUIRED`, `EXPANSION_READY`) follows
  from the latest decision on the account, not from Steward weighing anything.

Until the CRM connector lands, live mode lists the accounts that have decisions: the distinct
`context.identifier` values in the shadow reports, named from the CRM reference. That is a
smaller roster, not a fabricated one, and the page says so.

**Contract status.** The account surface is not yet on docs.decionis.com or in the OpenAPI
document. Its health route and `GET /v1/me` answer, and nothing more is discoverable without a
credential. Under the rule above, Steward's client for it is written against the contract once it
is published there; the section "Contract items to publish" lists what Steward needs from it.

## The mapping, contract by contract

### `CustomerOpportunity`

| Steward field       | Published source                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `evaluation_id`                                                                                                                                                                                                  |
| `accountId`         | `context.identifier`, the account reference Steward sent                                                                                                                                                         |
| `kind`              | `decision_type`                                                                                                                                                                                                  |
| `disposition`       | `verdict` (ALLOW, ESCALATE, BLOCK) when the response carries protocol 1.1, else `outcome`: APPROVE is ALLOW, REJECT is BLOCK, ESCALATE and REVIEW as themselves                                                  |
| `status`            | OPEN for ESCALATE and REVIEW; APPROVED or REJECTED from the surface decision; HELD from an override in PENDING or ESCALATED; COMPLETED when the chain's `evidence_lineage` reaches FINALIZATION or EFFECT        |
| `confidence`        | `confidence`                                                                                                                                                                                                     |
| `rationale`         | `reason_codes`, rendered through the reason-code catalogue; `reason` and `policy_guard_reason` from the shadow report                                                                                            |
| `recommendedAction` | `execution_action`: CONTINUE, STOP, HAND_OFF, REVIEW                                                                                                                                                             |
| `dossierId`         | `dossier_id`, with the public verify link                                                                                                                                                                        |
| `arbitration`       | `policy_snapshot` (policy version, bundle id, digests) as `policyReference`; `selected_rule_id`; the dossier's `signal_context` for the governing and overridden signals; `reason_codes` for what was suppressed |
| `evidenceIds`       | The artifact ids of the envelopes the dossier's `signal_context` accepted                                                                                                                                        |
| `evidenceCoverage`  | Presentation: how many of the five context classes the accepted signals cover                                                                                                                                    |
| `priority`          | Presentation: URGENT for ESCALATE with HAND_OFF, ELEVATED for REVIEW, ROUTINE otherwise                                                                                                                          |
| `createdAt`         | `created_at`                                                                                                                                                                                                     |

### `OpportunityReview`

| Operator action | Published operation                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| APPROVE         | `POST /v1/protocol/surfaces/decisions` with `surface: "steward"`, `decision: "authorize"`, the dossier id and digest            |
| REJECT          | The same with `decision: "block"`                                                                                               |
| HOLD            | The same with `decision: "review"`, plus `POST /v1/protocol/overrides` carrying the note as `override_note` and the reason code |

The result Steward shows is the ledger entry id as `reviewId`, the dossier re-read, and the chain
re-read for status. The caption stays true in every mode: a surface decision is recorded, and in
`shadow` nothing executes; in `enforced` the platform executes under its own grants, outside
Steward, which is the paid tier as [OpenCore.md](../OpenCore.md) states it.

### `CustomerAccount`

| Steward field    | Published source                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| summary fields   | The CRM connector (S4); interim, the identifiers seen in decisions                                                                                  |
| `connectors`     | The Sources page's sources and their health, already in the tree                                                                                    |
| `evidence`       | Collected signals, with the Protocol's artifact id once forwarded                                                                                   |
| `timeline`       | SIGNAL from collected signals; DECISION from chain links; ACTION and OUTCOME from `evidence_lineage` stages                                         |
| `policyEnvelope` | `policy_snapshot` for the version; the decision graph for the parameters the operator's pack exposes; fields the pack does not expose are not shown |

### `PortfolioSnapshot`

Accounts from the roster, opportunities from the shadow reports (or the ledger once enforcing)
over a window, `summary` counted in `presentation/` from those two lists, `dataStatus` LIVE.

### `EvidenceSignal` and `CapturedSignal`

Unchanged in shape. A forwarded `CapturedSignal` becomes one signal envelope: `source.provider`
"steward", `source.mode` CUSTOMER_INFRA for a connector and MANUAL for an upload,
`source.connector_id` the Steward source id, `domain` the category, `metric_type` "event",
`recorded_at` the observation time, `dimensions` carrying the account reference, source record,
title, detail and context class, and the `semantic` block carrying `signal_id`, `kind`,
`observed_at`, `confidence_basis_points` and `material: true`. The 202 returns `artifact_id`,
which is the evidence id the dossier later cites.

## Credentials

The published API authenticates org-scoped calls with the org API key as a bearer token. Steward
holds it on the server, from the environment or, encrypted, from its own database, the environment
winning when both are present (decision D3). Either way it is never in the tree, never in the
browser, never in a URL or a log. The environment names are the ones the deployment bundle emits:
`DECIONIS_API_KEY`, `DECIONIS_ORG_ID` and `DECIONIS_WORKSPACE_NAME`. The operator's own session
still gates every page and route, and the operator's identity travels in the surface decision and
the override as the actor. The public verify route and the health probe need no credential.

## First boot

An operator who has no Decionis account yet does not need to leave Steward to get one. Steward
boots with two parameters, the owner's email and the organisation's name, and creates the account
and its workspace through the Decionis API:

```bash
docker run -p 3000:3000 -v steward-data:/app/data ghcr.io/decionis/steward:<version> \
  --email ops@zulu.example --org "Zulu Financial"
```

`STEWARD_OWNER_EMAIL` and `STEWARD_ORG_NAME` do the same where a platform cannot pass arguments.
The resolution order is the one in [docs/Persistence.md](./Persistence.md), with the boot
parameters as its third step:

1. **The environment** holds the credentials: use them.
2. **The Steward database** holds a workspace: use it.
3. **Boot parameters** are given: start the published public onboarding.
   `POST /v1/public/auth/register/start` with the owner email, a display name taken from it, and
   the organisation name; Decionis emails the owner a six-digit code, and the log and the first
   page say where to enter it. The code is entered on the setup page, never on the command line,
   and goes to `POST /v1/public/auth/register/verify`, which returns the onboarding grant and the
   org id. A signal-mapping session and its deployment bundle then issue the org API key, the
   connector id and the policy version, which Steward stores encrypted in `workspaces` under the
   organisation's name, and the owner becomes Steward's first administrator. Booting again with
   the same parameters once the workspace exists changes nothing.
4. **None of these**: the setup page offers the same signup, the provisional no-account
   workspace (D7), or pasting the credentials of a workspace that already exists.

The setup page answers without a sign-in only until the first administrator exists, and only for
these steps; after that it is an administrator's page like any other.

## Rules the organisation edits

The platform owns the rules and evaluates them; the organisation edits them, and every edit is a
new version (decision D6). Steward is where an administrator does the editing, and it never
evaluates a rule itself:

- **See** the version in force for each decision type: the `policy_snapshot` every evaluation
  returns (version, bundle id, digests, effective window), and the decision graph.
- **Draft** a change in Steward, or have the platform draft one from documents and live sources
  with `POST /v1/orgs/{org_id}/policies/packs/draft`, whose clauses that cannot become rules come
  back as review items rather than broken rules.
- **Validate** with `POST /v1/policies/validate`, which answers valid, errors and warnings.
- **Submit** with `POST /v1/protocol/policies/bundles`: a new `version`, an `effective_from`, the
  rules, and `metadata.author` naming the administrator; the platform answers with the artifact id
  and the version takes effect when it says so.
- **Record** each submission as an activity with its version and artifact id, so the history of
  who changed which rule is readable in Steward as well as in the platform's ledger.

Editing needs the `ADMIN` role. Reading the current rules of a bundle is the one piece the
published API does not yet offer: it returns versions and digests everywhere, and the decision
chain page says rules are deliberately not exposed to applications. The editor therefore needs a
read operation for the organisation's own bundle, which is the second contract item below.

## The free tier, literally

`mode: SHADOW` on every evaluation is the free tier: real accounts, real signals, real decisions
recorded and readable, nothing executed. `ENFORCEMENT` is the paid tier, set per workspace by the
platform, not by Steward. `POST /v1/public/agents/provision` mints a provisional shadow workspace
with no account and no email, capped and claimable later, so "Connect your platform" can put a
tenant into live shadow in one click. The activation point in [OpenCore.md](../OpenCore.md) does
not move; it gets a shorter path.

## What leaves the tree

- `infra/api/DecionisStewardGateway.ts` and the four `/v1/cdi` operations.
- `infra/api/samples/*Response.json` and `DecionisContract.test.ts` as they stand; replaced by
  samples taken from the OpenAPI examples and the docs pages, driven through the new client.
- [docs/ContextEngineeringUpstreamRequest.md](./ContextEngineeringUpstreamRequest.md), kept and
  marked superseded: `contextClass` is Steward's own field on a collected signal, and `arbitration`
  is assembled from the dossier and the policy snapshot.
- The "Protocol request" sections of the other plans, already withdrawn.
- `DecionisSignalIngressClient`, the webhook mapper and the three `DECIONIS_WEBHOOK_*` variables,
  since D2 chose envelopes.

Demo mode does not change. The fixtures stay, and the demo repository keeps returning them; what
changes is that the shapes they return are now built from published contracts, so a fixture and a
live response are parsed by the same schemas.

## What the proactive-support plan becomes

| Workstream                    | Under the published Protocol                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 value tiers and clusters   | Fields on the roster the CRM connector returns; grouping is presentation. No contract addition.                                             |
| P3 events around the customer | Signals from a connector to a regulatory or news feed, forwarded as categorical envelopes with an `ENVIRONMENTAL` dimension.                |
| P4 proactive support plays    | A `decision_type` of `PROACTIVE_SUPPORT` with the group as `context`; the organisation's rules for it are edited in C8. No Protocol change. |
| P5 the minimum viable payload | Steward's own map from `decision_type` to the context classes it sends; coverage is computed from what was accepted.                        |
| P6 the loop measured          | Unchanged, now over `created_at`, chain timestamps and `evidence_lineage.occurred_at`.                                                      |

## Decisions taken

Answered by the owner on 25 September 2026.

| #   | Question                                                            | Decision                                                                                                                                                                                |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where do accounts come from?                                        | The organisation's account is the Protocol's, on the account surface at accounts.decionis.com. The customer roster, which that surface does not serve, comes from Steward's connectors. |
| D2  | Signal envelopes, or the webhook ingress built in #91?              | Envelopes; the webhook client is retired.                                                                                                                                               |
| D3  | Does Steward hold the org API key on the server?                    | Yes, from the database or the environment. Steward can boot with the owner's email and the organisation's name and create the account and workspace through the Decionis API.           |
| D4  | How is a review recorded?                                           | Surface federation for APPROVE and REJECT; federation plus an override for HOLD; appeals as overrides.                                                                                  |
| D5  | What happens to `healthScore` and the limit-specific policy fields? | `healthScore` is retired; state follows the latest decision; only the policy parameters the decision graph exposes are shown.                                                           |
| D6  | Are Steward's opportunity kinds the `decision_type` vocabulary?     | Yes, plus `PROACTIVE_SUPPORT`. The platform owns the rules, the organisation can edit them, and every edit becomes a new version.                                                       |
| D7  | Does "Connect your platform" offer a provisional workspace?         | Yes, as the no-account path on the setup page, clearly marked provisional.                                                                                                              |

## Contract items to publish

Two things Steward needs are not yet on docs.decionis.com, and under the rule this document
starts from, Steward waits for them there rather than coding against an unpublished shape:

| Item                                        | What Steward needs                                                                                                  | Used by     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| The account surface (accounts.decionis.com) | `GET /v1/me` (who is signed in, their organisation, workspace and roles), and how a first-boot signup relates to it | C7, sign-in |
| Reading the organisation's rules            | The rules of the bundle in force for a decision type, for the organisation that owns them                           | C8          |

Every other operation in this document is published already.

## Workstreams

#### C0 — This plan and the boundary documents

OpenCore's seam becomes "the published Protocol"; ThreatModel gains the org API key as an asset;
README, Architecture, EvidencePack and the discovery files stop naming `/v1/cdi`.

#### C1 — The Protocol client

`infra/api/DecionisProtocolClient.ts` over `JsonHttpClient`, bearer `DECIONIS_API_KEY`, one method
per published operation Steward uses, each response parsed by a Zod contract in `domain/protocol/`
taken from the OpenAPI schemas. Samples in `infra/api/samples/` from the OpenAPI examples; the
contract test drives them through the client. `Idempotency-Key` on every write.

#### C2 — Signals as envelopes

`DecionisSignalRepository` sends one envelope per signal and returns the artifact ids in
`SignalForwardResult`; the evidence panel shows them. The webhook client and its variables go.

#### C3 — Decisions from the Protocol

Evaluate an account event on collection and on demand, SHADOW by default; the queue from the
shadow reports and, once enforcing, the ledger; "Why this disposition" from the dossier and the
policy snapshot; the reason-code catalogue read once per request and rendered.

#### C4 — Reviews as surface decisions and overrides

The review route federates the decision and, for HOLD, opens an override; status is derived as the
mapping above says; the result re-reads the dossier and the chain.

#### C5 — Accounts from connectors

Depends on S4 in the signal-connectors plan. Until then, the interim roster from decisions.

#### C6 — Remove the private contract

The gateway, its samples and tests, the superseded request document, and every mention.

#### C7 — First boot and the setup page

`--email` and `--org` (and `STEWARD_OWNER_EMAIL`, `STEWARD_ORG_NAME`) on the server's launcher;
the published public onboarding through to the deployment bundle; the credentials stored
encrypted; the owner made the first administrator; the setup page with the signup, the
provisional workspace, and pasted credentials. Depends on DB2 and DB3 in
[docs/Persistence.md](./Persistence.md).

#### C8 — Rules the organisation edits

The Rules page: the version in force per decision type, drafting, validation, submission as a new
version, the platform's draft from documents, and every submission recorded as an activity. Needs
the rules-read contract item.

## Sequencing

| Stage            | Work   | Gate                                                                          |
| ---------------- | ------ | ----------------------------------------------------------------------------- |
| **1. Decide**    | D1–D7  | Taken, 25 September 2026                                                      |
| **2. Client**    | C0, C1 | Contract test green on the published schemas; `pnpm verify`                   |
| **3. Signals**   | C2     | A live envelope accepted by a shadow workspace, artifact id shown             |
| **4. Decisions** | C3, C4 | A live shadow decision in the queue, reviewed, recorded, verified by its link |
| **5. Boot**      | C7     | `--email` and `--org` reach live shadow on an empty volume                    |
| **6. Cut over**  | C6     | No `/v1/cdi` reference in the tree; discovery and boundary documents agree    |
| **7. Roster**    | C5     | After the CRM connector (#101)                                                |
| **8. Rules**     | C8     | After the rules-read contract item is published                               |

## Decisions recorded

| Question                                         | Decision                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Which API does Steward speak upstream?           | The one published at docs.decionis.com, with the OpenAPI document as the contract         |
| Does Steward ask the Protocol for any operation? | No                                                                                        |
| Who decides, executes, records?                  | The platform, unchanged; Steward collects, asks, shows, and records what the operator did |
| Does anything persist in Steward?                | No; the roster, the evidence and the decisions are read per request                       |
