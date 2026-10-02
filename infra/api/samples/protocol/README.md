# Protocol samples

Response bodies for the published Decionis Protocol operations Steward uses, in the shapes the
OpenAPI document at `https://decionis.com/.well-known/openapi.json` (0.5.0) and the pages at
[docs.decionis.com](https://docs.decionis.com/) publish. `ProtocolContract.test.ts` drives each one
through `DecionisProtocolClient` and the contracts in `domain/protocol/`.

**Provenance: constructed from the published schemas, not captured.** The OpenAPI document carries
no examples for these operations. When a staging workspace is available, replace each file with a
capture and keep the test green; that is the moment the contract is pinned to reality. A capture
must follow the demo conventions (references shaped `CRM-DEMO-000n`, no email, phone or URL) before
it is committed, because these files are published; the provenance test enforces it.
