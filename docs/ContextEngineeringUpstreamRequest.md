# Upstream change request: context fields on the CDI contract

**Status: answered 24 September 2026.** The platform will carry both fields below;
`GET /v1/cdi/opportunities` returns open and completed items; contract additions are versioned, so
these ship as a versioned CDI change and the Steward release carrying them is a minor bump. Kept as
the record of what was asked and agreed. Stage 2 of [ContextEngineering.md](ContextEngineering.md)
(W1, W2, W5) and W6 are being implemented.

## Two optional fields

Both are optional. A response without them parses exactly as today, and Steward renders exactly
what it renders today. Steward never fills either in from a heuristic: a wrong class label on a
regulated decision is the same defect as a wrong number.

### 1. `contextClass` on evidence

On each signal returned by `GET /v1/cdi/accounts/:accountId` (the `evidence` array):

```ts
contextClass?: "JOURNEY" | "INTENT" | "FRICTION" | "OPERATIONAL" | "POLICY";
```

Five classes, not the six in the source framework. `ENVIRONMENTAL` (end-customer device and network
state) has no producer in the platform, and Steward will not collect it. Add it the day a producer
exists.

The existing `category` (`USAGE`, `SUPPORT`, `CRM`, `TRANSACTION`, `KYC_KYB`) is **not** replaced.
It says where a signal came from; `contextClass` says what kind of situation it describes. An
operator needs both.

What Steward does with it: shows the class beside the source category on the account evidence
panel (W1), and a per-class coverage strip so an approver can see that, say, no operational signal
backs an expansion recommendation (W5).

### 2. `arbitration` on opportunities

On each item returned by `GET /v1/cdi/opportunities`, and on the `opportunity` in the response to
`POST /v1/cdi/opportunities/:opportunityId/reviews`:

```ts
arbitration?: {
  governingClass: "JOURNEY" | "INTENT" | "FRICTION" | "OPERATIONAL" | "POLICY";
  governingEvidenceIds: string[]; // at least one; ids from the account's evidence
  overriddenEvidenceIds: string[]; // may be empty
  suppressedActions: string[]; // may be empty; human-readable, e.g. "Processing-limit review"
  policyReference: string; // the policy version that produced this disposition, e.g. "customer_ops.v4"
  summary: string; // one or two sentences
};
```

Example, for the demo's Tango Trade Services hold:

```json
{
  "governingClass": "POLICY",
  "governingEvidenceIds": ["ev-tango-kyb"],
  "overriddenEvidenceIds": ["ev-tango-usage"],
  "suppressedActions": ["Processing-limit review"],
  "policyReference": "customer_ops.v4",
  "summary": "Beneficial-ownership evidence is outside the 90-day freshness window the active policy requires. Utilisation supports a review, and is overridden until the record is refreshed."
}
```

What Steward does with it: renders a "Why this disposition" block on the queue card and the account
decision panel, naming the governing context, what it overrode, what it suppressed, and under which
policy version (W2). Steward renders the object and never computes it. If `disposition` is `BLOCK`
and `arbitration` is absent, the card looks as it does today.

## Three questions

| Question                                                                                                                   | Why it matters                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Will the platform carry `contextClass` and `arbitration` as above, and roughly when?                                       | Decides whether W1, W2, and W5 proceed at all. Demo-only contract fields are not worth shipping.                                                     |
| Does `GET /v1/cdi/opportunities` return `COMPLETED` items, or only open ones? If only open, is a `status` filter feasible? | W6 renders recently resolved decisions and their outcomes. Without completed items in the response, it would be demo-only and waits.                 |
| Is `/v1/cdi` still pre-1.0 upstream, so optional fields can be added without a version bump?                               | Steward's contracts are pre-1.0 and documented as such; the same needs to be true on the producing side, or the additions need a version and a date. |

## What does not change

- No new endpoint. No new required field. No change to authentication, organisation scoping, or the
  review request body.
- Steward's role check stays a UX affordance; the platform still re-authorises every review.
- Nothing is persisted in Steward. These fields are read per request and rendered.
