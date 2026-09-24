# Open-core boundary

This document states, in one place, what is open source in this repository, what Decionis operates
as a service, where the seam between them is, where commerce enters the flow, and what the project
commits to about that seam. It exists so that an engineer, a contributor, or a diligence reviewer
does not have to infer the business model from the code.

## The short version

- **Open (Apache-2.0):** all of Steward. The operator interface, the review workflow, the
  server-side orchestration, the typed contracts, the demo fixtures, the tests that prove the trust
  boundary, the image, the tarball, the documentation and the machine-discovery files.
- **Operated (Decionis, not in this repository):** the platform behind `/v1/cdi`: policy evaluation
  and the `customer_ops` policy pack, execution grants, Decision Dossiers, the audit ledger,
  connector credentials, identity resolution, and Presence.
- **The seam:** one TypeScript interface and four versioned HTTP operations. Anyone can implement
  the interface. Steward does not check a plan, a key, or an entitlement.
- **The activation point:** the first review that is meant to execute. Everything before it is
  free; the platform making a change is what is paid.

## What is Apache-2.0 here

| Component                                                  | Where                         | Why it is open                                                                                    |
| ---------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| The operator interface and every screen                    | `app/`, `components/`         | The surface an operator makes regulated decisions on must be inspectable by the people who run it |
| Use-case services and the role gate                        | `application/`                | The gate is a UX affordance, and saying so in public is what keeps integrators honest about it    |
| Typed, runtime-validated contracts                         | `domain/`                     | The wire shape Steward accepts is the contract; a hidden contract is not one                      |
| The BFF, the gateway, the session resolver, the config     | `infra/`                      | Everything that touches a credential or an upstream must be readable, because it holds no secret  |
| Demo fixtures and their provenance tests                   | `infra/demo/`                 | Anyone can run the whole workflow with no account and no data that could be mistaken for real     |
| The image, the release pipeline, the SBOM, the attestation | `Dockerfile`, `.github/`      | Supply-chain evidence is only evidence if the recipe is public                                    |
| Machine discovery                                          | `public/llms.txt`, `llms.txt` | An agent evaluating Steward should find the same facts a person does                              |

There is no source-available or delayed-open license in the plan, and no second edition of this
tier.

## What Decionis operates

The platform behind the `/v1/cdi` API owns:

- policy authoring, versions, and evaluation of account evidence into recommendations with a
  disposition and, from the versioned contract change of September 2026, an arbitration;
- execution grants: the authority for an approved review to change a processing limit or a policy
  state, and the record that it did;
- Decision Dossier creation, retention, and the audit ledger that Steward's timeline renders;
- connector credentials, SignalFed, and identity resolution across usage, support, CRM,
  transaction and KYC/KYB sources;
- tenant identity, the sign-in handoff, organisation scope, roles, and Presence for
  human-verified approval where policy escalates.

None of that code is in this repository, and this repository does not proxy it beyond forwarding a
review with the operator's own credential.

## The seam

**Code interface**, in `infra/repositories/StewardRepository.ts`:

```ts
interface StewardRepository {
  getPortfolio(): Promise<PortfolioSnapshot>;
  getAccount(accountId: string): Promise<CustomerAccount | null>;
  listOpportunities(): Promise<CustomerOpportunity[]>;
  reviewOpportunity(
    opportunityId: string,
    review: OpportunityReview,
  ): Promise<OpportunityReviewResult>;
}
```

`DemoStewardRepository` and `DecionisStewardRepository` both implement it, chosen once by
`StewardRepositoryFactory`. The application and the interface cannot tell them apart, and a third
implementation against another backend is a first-class citizen.

**Wire operations**, parsed through the Zod contracts in `domain/`:

| Operation                                           | Purpose                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /v1/cdi/portfolio`                             | The portfolio snapshot for the session's organisation                                       |
| `GET /v1/cdi/accounts/:accountId`                   | One account: evidence, connectors, timeline, policy envelope                                |
| `GET /v1/cdi/opportunities`                         | Open and completed recommendations                                                          |
| `POST /v1/cdi/opportunities/:opportunityId/reviews` | Forward a review; the platform decides, executes, and returns state and a dossier reference |

## Free and paid

| Free, forever, in this repository                                                                                    | Paid, operated by Decionis                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The whole operator tier, every screen, the review flow                                                               | Policy evaluation and the policy pack, with versions                               |
| Demo mode: deterministic fixtures, no account, no credential, nothing persisted                                      | Execution grants: the review that actually changes a limit                         |
| Live mode against a Decionis workspace in shadow: real evidence and recommendations, reviews recorded, dossiers read | Decision Dossier retention, the audit ledger, export                               |
| The image on GHCR and Docker Hub, the release tarball, the source                                                    | Connectors at scale, identity resolution, SSO and SCIM, Presence-verified approval |
| Documentation, the threat model, the evidence pack, machine discovery                                                | Support, SLAs, and hosted Steward for tenants who do not want to run the container |

## Where commerce enters the flow

1. **Run it.** `docker run` or `pnpm dev`; demo evidence, no account. Free.
2. **Connect your platform.** The sign-in handoff provisions a Decionis workspace that decides in
   shadow. Free.
3. **Live, in shadow.** Real accounts, real evidence, reviews recorded, dossiers readable. Free. This
   is where an adopter learns whether the recommendations are worth acting on.
4. **Enforce.** The tenant moves to a plan; approved reviews execute under grants and come back as
   `COMPLETED` decisions with outcomes. Paid.

The caption on every review control, "Records a review only; no downstream limit is changed", is
the free tier stated in the interface. The platform making the change is the paid tier. Nothing in
this repository moves that line; the platform does, per tenant.

## Questions a reviewer will ask

**Can I run this without Decionis?** Yes, in demo mode, forever, with the whole workflow. Live mode
needs an implementation of `StewardRepository` against a backend that speaks the four operations:
the Decionis platform, or your own.

**Is the interface feature-gated?** No. Nothing here checks a license key, plan, seat count, or
entitlement, and there are no hidden network calls: the server tier talks only to the configured
`DECIONIS_API_BASE_URL`, and the browser only to this application's own routes. If a screen shows
something only paying tenants have, it is because the platform returned it.

**Is there a "Plus" build?** No, and there will not be one. A paid build of the operator tier would
put entitlement logic into the repository the trust boundary exists to keep it out of. The image is
the same bytes for everyone.

**Will the boundary move?** The project commits to the following; a change to any of them is a
trust-boundary change and goes through a public pull request with code-owner approval:

1. Steward stays Apache-2.0. No source-available, delayed-open, or dual license.
2. Demo mode stays complete: every screen and the review flow work with no account.
3. No license check, plan check, entitlement read, telemetry, or outbound request to any host but
   the configured platform, in any mode.
4. The four operations stay published, and `domain/` stays the contract that parses them.
5. Contributions are accepted under the Developer Certificate of Origin, not a contributor
   license agreement. Decionis does not collect copyright assignments.

**What does Decionis sell?** Operating the platform: policy, execution, dossiers, the ledger,
connectors, identity, Presence, and support. Commercial terms are not part of this repository.

**Can I fork it?** Yes, under Apache-2.0. A modified distribution should not present itself as the
official project or imply Decionis endorsement; see [NOTICE](./NOTICE).

## Why this shape

The part that must be inspectable by the people who make regulated decisions on it, the operator
tier, is open. The part that must be operated with continuity, retention and independent identity,
the authority and its evidence store, is a service. Keeping those two in separate trust domains is
the architecture; that it is also the business model is a consequence, not the reason.
