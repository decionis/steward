# Steward Architecture

## Trust boundary

```text
Browser
  -> Steward Next.js server / BFF
    -> signal connectors: CRM, ERP, MCP servers, documents, file servers
    -> Decionis /v1/cdi APIs
      -> signal ingestion, identity resolution, weighting
      -> customer_ops policy pack
      -> execution grants, dossiers, ledger
```

The Steward repository owns presentation, server-side orchestration, and the connectors that collect
signals from the operator's own systems. The Decionis platform owns identity resolution, the weighing
of signals, policy decisions, and action execution. [docs/SignalConnectors.md](docs/SignalConnectors.md)
records the decision that put collection here.

## Directory structure

```text
app/                          Next.js routes and framework entrypoints
  accounts/[id]/              Account evidence view
  api/steward/                    Browser-facing Steward BFF
  sign-in/                    Decionis identity handoff
  signals/                    Signal sources page
application/                  Use-case services and permission checks
  accounts/
  dashboard/
  opportunities/
  signals/
components/                   Feature-grouped React presentation
  account/
  common/
  dashboard/
  layout/
  signals/
domain/                       Typed, runtime-validated Steward contracts
  accounts/
  auth/
  common/
  evidence/
  opportunities/
  portfolio/
  signals/
infra/                        External systems and implementation details
  api/
  auth/
  composition/
  config/
  connectors/
  demo/
  errors/
  repositories/
presentation/                 Formatting and presentation policies
  format/
```

## Runtime modes

### Demo

Deterministic fixtures are returned by `DemoStewardRepository`. Mutations return a deterministic review
result and do not persist or execute a downstream action.

### Live

`DecionisStewardRepository` uses the server-only `DecionisStewardGateway`. Responses are parsed through Zod
contracts before entering the application layer. Authentication and organization scope are forwarded
server-side.

## Decision safety

The external application may accept an operator review. It cannot directly change a processing limit
or policy. The core Steward API must create or update the authoritative review, invoke the Decionis policy
and execution boundary, and return the resulting state and dossier reference.

## The decision loop

Every account decision passes through the same four stages, and `AccountTimelineEvent.kind` already
names them:

| Stage      | Loop step               | Who performs it                                                                                                                                                    |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SIGNAL`   | Sense                   | Steward's connectors collect from the operator's systems and forward; the platform resolves and weighs; Steward renders the result with source, freshness, health. |
| `DECISION` | Interpret and arbitrate | The `customer_ops` policy pack correlates evidence into a `CustomerOpportunity` and sets its disposition.                                                          |
| `ACTION`   | Act                     | An operator review is forwarded; the platform executes under an execution grant.                                                                                   |
| `OUTCOME`  | Result                  | The resulting state, recorded against a Decision Dossier.                                                                                                          |

Steward collects the raw material of the first stage and renders every stage; it does not weigh, does
not arbitrate, and does not execute. [docs/ContextEngineering.md](docs/ContextEngineering.md) maps this loop onto the
published context-engineering framework and records the plan for making each stage more legible to
the operator reviewing it.

`presentation/` may summarise data that is already on the page, for example the weakest freshness
among the evidence an opportunity links, or which of its sources report degraded health, so that an
operator sees the state of the context at the moment they review. It never derives a disposition,
weights a signal, or decides anything from that summary. Summaries are formatting policy; decisions
are the platform's.
