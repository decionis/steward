# Run Steward in Docker

> Give your operators a governed surface for reviewing customer and account decisions, without
> moving policy authority into the interface.

## What your operators get

One container, and the people closest to your customers, in operations, risk and revenue, get a
place to act that is auditable by construction:

- **A queue of evidence-backed recommendations.** Friction interventions, KYC/KYB escalations,
  processing-limit reviews and expansion outreach, each with its rationale, its confidence, the
  evidence it rests on, and, when the platform supplies it, why it got the disposition it did.
- **Account detail an approver can trust.** Every signal with its source and freshness, the health
  of the sources behind it, the policy envelope in force, and a one-line statement of how fresh the
  context is at the moment they review.
- **A review flow that records rather than executes.** Accept, hold or reject, and the review is
  forwarded to the Decionis platform with the operator's own credential. Nothing downstream changes
  until the platform decides. The caption on every control says so.
- **Inaction and outcomes made visible.** A decision to do nothing appears as a decision, with its
  evidence and dossier; decisions that reached an outcome appear under "Recently resolved".

What stays where it belongs: policy evaluation, connector credentials, execution grants, Decision
Dossiers and the audit ledger all live in the platform. The container holds none of them, checks no
license, and sends nothing anywhere but the platform you point it at.

## Five minutes, no account

```bash
docker run --rm -p 3000:3000 ghcr.io/decionis/steward:0.3.0
```

Open <http://localhost:3000>. You are signed in as a fixture operator with the approver role over
four invented accounts, and the interface says `DEMO EVIDENCE` so nobody mistakes it for a tenant.
Work the queue: accept a limit review, hold an expansion, reject an escalation. Each review is
recorded and nothing is executed, which is exactly what your operators will see in production
until the platform is entitled to act.

## Connect your platform

Live mode puts real accounts in front of your operators. They sign in through Decionis, arrive with
their organisation and roles, and see their portfolio.

```bash
docker run --rm -p 3000:3000 \
  -e STEWARD_DATA_MODE=live \
  -e DECIONIS_API_BASE_URL=https://api.decionis.com \
  ghcr.io/decionis/steward:0.3.0
```

What changes for operators: the accounts are theirs, the evidence is current, the recommendations
are the platform's, and their reviews reach the platform's ledger. What does not change: the
container still holds no policy and no credential, a review still cannot change a limit by itself,
and if the platform cannot be reached the operator sees an error, never invented data. The process
refuses to start in live mode without a platform address rather than degrading.

As a compose file, hardened the way a cluster would run it:

```yaml
services:
  steward:
    image: ghcr.io/decionis/steward:0.3.0
    ports: ["3000:3000"]
    environment:
      STEWARD_DATA_MODE: live
      DECIONIS_API_BASE_URL: https://api.decionis.com
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
```

Put TLS termination in front of it. The operator's session arrives as cookies from the Decionis
sign-in handoff, and the browser only ever talks to this container, never to the platform directly.
The [README](../README.md#configuration) lists every variable; the two above are the only ones
live mode needs.

## What is free, and where paying starts

Everything you have run so far is free, and stays free: the whole surface, demo mode, and live mode
against a Decionis workspace that decides in shadow, where your operators see real evidence and
their reviews are recorded. Paying starts at one point, and it is not in this container: the first
review that is meant to execute, where the platform changes a limit under an execution grant. The
image is the same bytes for a free tenant and a paying one; [OpenCore.md](../OpenCore.md) states
the boundary and the commitments that keep it there.

## Trust the image before your operators do

```text
ghcr.io/decionis/steward:<version>     immutable: run this in production
ghcr.io/decionis/steward:<major>.<minor>
ghcr.io/decionis/steward:<major>
ghcr.io/decionis/steward:latest        moves with releases; not for production
ghcr.io/decionis/steward:edge          moves with master; for trying tomorrow's build
```

The same manifest is on Docker Hub as `docker.io/decionis/steward` under the four release tags.
It is not a second build: after each release the
[Docker Hub workflow](../.github/workflows/dockerhub.yml) copies the release's manifest from GHCR
by digest, refuses a copy whose digest differs, and attests the Docker Hub name with the same
keyless identity. One digest names a release on both registries.

Prove the bytes came from this repository, on either registry:

```bash
gh attestation verify oci://ghcr.io/decionis/steward:0.3.0 --repo decionis/steward
docker buildx imagetools inspect ghcr.io/decionis/steward:0.3.0
```

The manifest carries BuildKit's SBOM and provenance for both architectures; the
[image workflow](../.github/workflows/image.yml) starts each image and checks the health probe,
the demo portfolio, every security header and the discovery file on both platforms before a byte
is pushed. The base image is pinned by digest and moved only by a Dependabot pull request. Mirror
the image into your own registry before a cluster pulls it, so a registry outage or a rate limit
cannot take a rollout down with it; Docker Hub rate-limits anonymous pulls.

## Reference

| Item                 | Value                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Port                 | `3000`                                                                                        |
| User                 | `node`, unprivileged                                                                          |
| Health               | `GET /api/health`, no session needed; the image's `HEALTHCHECK` and your load balancer use it |
| Discovery            | `GET /llms.txt`, no session needed; what this deployment is, for an agent evaluating it       |
| Demo mode            | The default; `STEWARD_DATA_MODE=demo`                                                         |
| Live mode            | `STEWARD_DATA_MODE=live` and `DECIONIS_API_BASE_URL`                                          |
| Logs                 | Standard output                                                                               |
| Shutdown             | `docker stop`; nothing is persisted, so nothing is lost                                       |
| Platforms            | `linux/amd64`, `linux/arm64`                                                                  |
| What the image holds | The built server, its static assets, `public/`                                                |
| What it never holds  | A policy, a credential, a connector secret, a database, customer data, a license check        |

The [threat model](../ThreatModel.md) says what a compromise of this tier can and cannot reach.
