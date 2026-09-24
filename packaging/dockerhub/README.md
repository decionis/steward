# Decionis Steward

**Give your operators a governed surface for reviewing customer and account decisions, without
moving policy authority into the interface.**

`decionis/steward` is the control center your customer-operations, risk and revenue teams use to
act on account evidence: a queue of evidence-backed recommendations, account detail an approver can
trust, and a review flow that records rather than executes. Every accept, hold or reject is
forwarded to the [Decionis](https://decionis.com) platform with the operator's own credential, and
nothing downstream changes until the platform decides. The caption on every control says so.

What stays in the platform: policy evaluation, connector credentials, execution grants, Decision
Dossiers, the audit ledger. The container holds none of them, checks no license, and sends nothing
anywhere but the platform you point it at.

## Five minutes, no account

```bash
docker run --rm -p 3000:3000 decionis/steward:0.3.0
```

Open <http://localhost:3000>. You are a fixture operator with the approver role over four invented
accounts, and the interface says `DEMO EVIDENCE`. Work the queue; each review is recorded and
nothing is executed, which is exactly what production looks like until the platform is entitled to
act.

## Connect your platform

```bash
docker run --rm -p 3000:3000 \
  -e STEWARD_DATA_MODE=live \
  -e DECIONIS_API_BASE_URL=https://api.decionis.com \
  decionis/steward:0.3.0
```

Operators sign in through Decionis and see their own portfolio. The container still holds no
policy and no credential; a review still cannot change a limit by itself; and if the platform
cannot be reached they see an error, never invented data. Put TLS termination in front of it. The
full guide, including a hardened compose file, is
[docs/Docker.md](https://github.com/decionis/steward/blob/master/docs/Docker.md).

## What is free, and where paying starts

The whole surface, demo mode, and live mode against a Decionis workspace deciding in shadow are
free and stay free. Paying starts at the first review that is meant to execute, where the platform
changes a limit under an execution grant. The image is the same bytes for a free tenant and a
paying one;
[OpenCore.md](https://github.com/decionis/steward/blob/master/OpenCore.md) states the boundary.

## Tags, and trusting them

```text
decionis/steward:<version>     immutable: run this in production
decionis/steward:<major>.<minor>
decionis/steward:<major>
decionis/steward:latest        moves with releases; not for production
```

This is the same manifest as `ghcr.io/decionis/steward`, built once by the release workflow of
[decionis/steward](https://github.com/decionis/steward) for `linux/amd64` and `linux/arm64`,
non-root, smoke-tested on both platforms before it was pushed, and copied here by digest: a copy
whose digest differs is refused, and the Docker Hub name is attested by the same keyless workflow
identity. Prove it before your operators rely on it:

```bash
gh attestation verify oci://docker.io/decionis/steward:0.3.0 --repo decionis/steward
docker buildx imagetools inspect docker.io/decionis/steward:0.3.0
```

The `inspect` digest equals the GHCR one for every version; a difference is a reason to stop and
report it. Mirror the image into your own registry before a cluster pulls it. `edge`, the moving
build of `master`, is on GHCR only.

## Reference

`3000` is the port. `GET /api/health` answers without a session for probes; `GET /llms.txt`
describes the deployment to an agent evaluating it. Logs go to standard output; `docker stop` ends
it and nothing is lost, because nothing is persisted. The
[threat model](https://github.com/decionis/steward/blob/master/ThreatModel.md) says what a
compromise of this tier can and cannot reach. Apache-2.0.
