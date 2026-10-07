# Steward · Ruian experience preview

[Open the hosted experience](https://steward-ruian-preview.vercel.app) · [Read the proposal](docs/Proposal.md)

A standalone demonstration for the Ruian Offices merchant growth brief. Two fictional merchants and six sample products let a reviewer try four focused experiences without sharing company or customer data.

| Experience        | What works in this preview                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover          | Ask for a lunch, gift or break; the live agent reads the sample catalogue and recommends matching items. Save items in this browser session.                                      |
| Customer journeys | Set fictional consent, generate three follow-up drafts and mark a journey approved locally.                                                                                       |
| Content studio    | Generate a caption and three video beats, preview a branded square or portrait graphic, and download the graphic and copy. Graphics use fixed illustrations with AI-written copy. |
| Service moments   | Ask about the sample location or service, then create and resolve a local demo handoff.                                                                                           |

No purchase, booking, message, membership enrollment, discount or staff notification is executed. There are no real Ruian locations, customers or merchants in the data. No authenticated Steward tenant, Decionis execution credential or production merchant connector is used. The preview is an example application, not a new authority inside Steward's customer operations console.

## Run locally

Requires Node 22 or newer and pnpm 9.15.3.

```sh
cd examples/ruian-preview
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

The sample catalogue works with the model disabled. Configure the three Azure variables in `.env.local` and set `PREVIEW_LLM_ENABLED=1` to enable live generation. Never use `NEXT_PUBLIC_` for provider credentials. Do not put secrets into tracked files.

The model deployment must support the Responses API, function tools and low reasoning effort. The hosted preview uses an existing Azure deployment. `PREVIEW_MODEL` is its deployment name. Endpoint validation accepts only a root HTTPS Azure OpenAI / AI Services endpoint. A model outage returns an explicit unavailable state; generated outputs are never replaced with fixtures.

## Verification

```sh
pnpm verify
```

Tests mock the model and firewall. They cover selected-merchant isolation, catalogue filtering, consent before generation, unsupported tool calls, duplicate or unknown product IDs, bounded outputs, API origins and body sizes, provider error redaction, shared rate-limit failures and concurrency release. Live model calls are a separate manual smoke check. CI builds with the model disabled and needs no secrets.

Root TypeScript, Vitest, ESLint and Prettier exclude this standalone package. The repository's Verify workflow checks it in its own job. No dependency or runtime change is needed in the core Steward app.

## Hosting and request limits

Deploy this directory to the separate Vercel project `steward-ruian-preview`. Do not change the existing `steward-demo` project binding.

Before enabling production generation, publish one **SDK rate-limit rule** with API ID `ruian-preview-ip`, fixed window **20 requests / 600 seconds**. `PreviewLimits` checks that same rule twice: once with the platform IP key, then with the constant custom key `ruian-preview-all`. This creates a per-visitor allowance and a shared allowance across visitors and instances. A missing, blocked or unavailable rule fails closed. Confirm the rule is live before setting `PREVIEW_RATE_LIMITS_READY=1`.

Set these variables in the project's production environment using the hosting secret store:

| Variable                    | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `AZURE_OPENAI_ENDPOINT`     | Approved Azure resource root URL         |
| `AZURE_OPENAI_API_KEY`      | Server-only resource credential          |
| `PREVIEW_MODEL`             | Existing model deployment name           |
| `PREVIEW_LLM_ENABLED`       | `1` enables generation; `0` pauses it    |
| `PREVIEW_RATE_LIMITS_READY` | `1` only after the SDK rule is published |

Each accepted request makes at most two sequential model calls: `read_merchant_context`, then `compose_preview`. Neither tool can execute a business action. Each call has a 1,500-output-token cap, `store: false`, no retries and no redirects. The route has an explicit **25-second combined model deadline** because content packs exceeded the standard 15-second request window during testing. Two firewall checks have a 2-second timeout each; the deployment function is capped at 30 seconds. Per-instance work is shed at four in-flight model requests. There is no application queue.

Requests require a matching Origin and Host, JSON under 4 KB, a prompt of 3–700 characters, a known mode and merchant, and fictional consent for journeys. Source labels are generated by the server. The model only receives public sample guides and the submitted prompt. The app persists no prompts or customer records and does not log provider responses or secrets. Azure and Vercel retain their own operational records under their service policies. Hosting request status and duration provide operational visibility without logging prompts.

There is no application analytics, advertising or third-party browser script. Responses use nonce-based CSP, no-store agent results and noindex headers. Saved items and approvals are temporary browser state and reset when the page reloads. Downloaded files remain with the reviewer.

To pause generation, set `PREVIEW_LLM_ENABLED=0` in the hosting environment and redeploy. The catalogue remains available. Remove the separate deployment when the cooperation review ends if a continuing preview is no longer needed.

## Files

```text
src/
  app/                 Next routes and document layout
  domain/              Fictional catalogue, contracts and graphic export
  features/preview/    Four interactive experiences and shared presentation
  server/              Bounded agent, model transport, API and request limits
  proxy.ts             Per-request nonce and CSP
test/                  Model and request-boundary regression tests
public/                Decionis brand asset and review proposal
```

The proposal is available at `/proposal.pdf`. Merchant content is illustrative and carries no Ruian endorsement. Real catalogue feeds, member consent systems, messaging, staff routing, commerce execution and mainland China deployment requirements need an agreed implementation scope before a pilot.

References: [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling), [Vercel rate-limiting SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk).
