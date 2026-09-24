# Proactive customer support: the plan

**Status: direction set 24 September 2026, implementation begun.** Each workstream lands as its
own pull request off `master`; P1 ships with this plan. The commercial boundary in
[OpenCore.md](../OpenCore.md) does not move: Steward plans, triages and renders; Decionis decides,
records and executes.

## The product statement

Steward is the open-source customer support decisioning platform. Businesses have customers, and
they want to support them before the customer asks or complains. To do that they need to see what
is happening across their accounts as it happens, classify customers by value, location and
cluster so support effort goes where it matters, take account of what is new around those
customers (a regulation, an outage, a market or environmental event), and act on a recommendation
whose evidence is on the page. Every action is recorded and executed by Decionis, so nothing
changes without an auditable path.

## What a business wants, in its own terms

| The business wants to                                                     | Which means Steward must                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Support a customer before they ask or complain                            | Surface friction, risk and opportunity as signals arrive, ranked, with the evidence, in one queue                     |
| Classify customers by financial value, location and cluster               | Group accounts by value tier, region and cluster, with the state of each group at a glance                            |
| Plan how support resources go to a customer or a group in a location      | Show where the friction, the reviews and the expansion opportunities are, by group, and what each needs next          |
| Take account of what is happening and what is new                         | Show live operational health beside the evidence, and events around the customer (regulatory, environmental, market)  |
| Know that a decision was made on current, complete, attributable evidence | Weigh signals at the moment of decision, say how fresh and complete they are, and name what led to the recommendation |
| Have every action executed and recorded, never improvised                 | Forward every review to Decionis; render the outcome and the dossier                                                  |

## The arguments, converted to features

From CX Today (the operational gap) and CMSWire (context engineering), each argument becomes a
feature, and each feature is either shipped, presentation over data Steward already has, a
contract addition the platform must supply, or platform work outside this repository.

| Argument                                                                         | Feature                                                                                       | Status                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Which system is authoritative                                                    | The ownership table; `LIVE`/`DEMO` on every snapshot; no fixture fallback                     | Shipped                                       |
| What data is current                                                             | Freshness on every signal; "Context at review"; source health                                 | Shipped (W4)                                  |
| Where each data point came from                                                  | Source and record on every signal; connector health                                           | Shipped                                       |
| Which information led to the recommendation, and what was overruled              | "Why this disposition": governing class, evidence, overrides, suppressions, policy version    | Shipped (W2); live when the platform sends it |
| Is the evidence complete                                                         | Coverage by context class                                                                     | Shipped (W5)                                  |
| Can a person understand, challenge and recover from an automated decision        | Rationale, review controls, "Recently resolved" outcomes                                      | Shipped (W6)                                  |
| Where should a person remain accountable                                         | The role gate as UX, the platform re-authorising, the caption on every control                | Shipped                                       |
| Signals weighed at the moment of decision, not read from a stale profile         | Every page fetched per request, `no-store`; freshness and health at review                    | Shipped                                       |
| The six signal classes: journey, intent, friction, operational, policy           | `contextClass` on evidence, badges, coverage strip                                            | Shipped (W1, W5)                              |
| The sixth class, environmental                                                   | Events around the customer: regulatory, environmental, market, operational                    | **P3**, contract addition                     |
| Context arbitration                                                              | Rendered as "Why this disposition"; never computed here                                       | Shipped (W2)                                  |
| Intentional inaction                                                             | `NO_ACTION` as a decision with evidence, the inaction group                                   | Shipped (W3)                                  |
| One control plane for records, journey state, live operational health, campaigns | Steward as the single console over them; the platform as the plane                            | Shipped in part; **P3**, **P4**               |
| The minimum viable payload of high-fidelity signals                              | What the decision needed against what it had                                                  | **P5**, contract addition                     |
| An event-driven intelligence layer bound into one operational loop               | The timeline's four stages; loop measures across the portfolio                                | Shipped in part; **P6**                       |
| Classify customers by value, location, cluster                                   | Planning by region and segment now; by value tier and cluster when the platform supplies them | **P1** now; **P2**, contract                  |
| Plan resources per customer or group in a location                               | The planning view: where the friction, reviews and expansion are, by group                    | **P1** now                                    |
| Support before the customer asks                                                 | Proactive support plays proposed by the platform, reviewed here                               | **P4**, contract addition                     |

## Workstreams

#### P1 — Plan support by region and segment (presentation, no contract change) ✅ Done

A "Plan support" section on the dashboard groups the portfolio by region and by segment, and for
each group shows accounts, active friction, expansion ready, reviews required, average health and
average utilisation, with the accounts named. Groups are ordered by friction, then reviews
required, then size, so the group that needs effort first is at the top. `SupportPlan` in
`presentation/planning/` groups and counts fields already on the page; it decides nothing.

#### P2 — Value tiers and clusters (contract addition)

`AccountSummary` gains optional `valueTier` (an enum the platform defines, for example
`STRATEGIC`, `CORE`, `LONG_TAIL`) and `cluster` (`{ id, name }`). The planning view gains "by
value tier" and "by cluster". Fixtures carry both; the coverage of a group by tier says where the
money is. Steward never derives a tier from a limit; the platform assigns it.

#### P3 — What is happening around the customer (contract addition)

`PortfolioSnapshot` gains `events[]`: `{ id, title, detail, kind: REGULATORY | ENVIRONMENTAL |
MARKET | OPERATIONAL, regions[], affectedAccountIds[], observedAt, source, freshness }`, and
`CustomerAccount` gains the subset that affects it. A "Happening now" panel on the dashboard lists
them by region; the account page shows the events touching that account beside its evidence. This
is the producer the `ENVIRONMENTAL` context class was waiting for, and W1's five classes become six
the day it ships. Steward renders events; the platform observes and classifies them.

#### P4 — Proactive support plays (contract addition)

`OpportunityKind` gains `PROACTIVE_SUPPORT`, and an opportunity may carry `targetGroup` (a region,
segment, tier or cluster) instead of, or as well as, an account. The platform proposes the play
("Contact the four UK corridors affected by the regulatory change before settlement day"); the
queue renders it with its evidence; an approver accepts, holds or rejects; the platform executes
and records it. Campaign logic stays in the platform. The planning view links each group to its
open plays.

#### P5 — The minimum viable payload (contract addition)

An opportunity may carry `requiredContextClasses[]`: what the policy needed to decide. The
coverage strip then shows needed against had, and a recommendation that decided on less than it
needed says so. The platform states the need; Steward compares.

#### P6 — The loop, measured (presentation over existing timestamps)

Across the portfolio: decisions made this week, outcomes reached, time from the first signal to
the decision and from the decision to the outcome, from the timeline events and opportunity
timestamps already returned. A "Loop" panel on the dashboard. No contract change; a summary, not a
judgment.

## Sequencing

| Stage           | Work   | Gate                                                                                 |
| --------------- | ------ | ------------------------------------------------------------------------------------ |
| **1. Now**      | P1, P6 | `pnpm verify`; screenshots; no `domain/` change                                      |
| **2. Ask**      | P2–P5  | The upstream request below sent; the platform's answer on each field and its version |
| **3. Contract** | P2, P3 | Optional fields, fixtures, tests, CODEOWNER review                                   |
| **4. Plays**    | P4, P5 | After P2 and P3, since a play targets a group and cites what it needed               |

## Upstream request

Four optional additions to the CDI contract, in the order they unblock features: `valueTier` and
`cluster` on account summaries (P2); `events[]` on the portfolio and per account (P3);
`PROACTIVE_SUPPORT` as an opportunity kind with `targetGroup` (P4); `requiredContextClasses[]` on
opportunities (P5). All optional; absent renders as absent; Steward infers none of them. The
`ENVIRONMENTAL` context class is added to the enum the day P3 ships, because it then has a
producer.

## Decisions needed

| Decision                                                     | Recommendation                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Does Steward stay non-authoritative under the new statement? | Yes. "Platform" names the product; the platform behind it decides. OpenCore.md's commitments hold. |
| Which value-tier vocabulary?                                 | The platform's; three tiers is enough to plan with.                                                |
| Are events observed by the platform or by Steward?           | The platform, through SignalFed; Steward renders. Steward adds no collector.                       |
| Is a proactive play an opportunity or a new object?          | An opportunity with a new kind and a target group; the review flow and the record already exist.   |

## Not in this plan

No collector, scraper, feed reader or model in Steward. No persistence. No local weighting of
signals. The intelligence is the platform's; the console that makes it legible and actionable is
this repository's.
