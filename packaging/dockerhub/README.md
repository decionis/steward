# Decionis Steward — the operator tier for governed customer decisions

`decionis/steward` is Steward as a container: the control center customer-operations, risk and
revenue teams use to review account evidence and route every decision through the
[Decionis](https://decionis.com) platform, where the authoritative decision is made, recorded and
executed. Steward renders evidence and forwards reviews. It decides nothing itself, holds no policy,
no credential and no customer data at rest, checks no license and reports nothing.

This is the same image as `ghcr.io/decionis/steward`, built once by the release workflow of
[decionis/steward](https://github.com/decionis/steward) for `linux/amd64` and `linux/arm64`,
non-root, with no configuration and no credential inside it.

## Tags

```text
decionis/steward:<version>     immutable: use this in production
decionis/steward:<major>.<minor>
decionis/steward:<major>
decionis/steward:latest        moves; never in production
```

The tag is the release version; the
[releases page](https://github.com/decionis/steward/releases) lists them with their digests.
Docker Hub carries the same manifest list as `ghcr.io/decionis/steward`: after each release the
manifest is copied here by digest, a copy whose digest differs is refused, and the Docker Hub name
is attested by the same keyless workflow identity. One digest therefore names a release on both
registries, and either name pulls the same bytes. `edge`, the moving build of `master`, is on GHCR
only.

## Run it

Demo mode is the default: deterministic fixtures, no account, no credential, nothing persisted,
the whole review flow.

```bash
docker run --rm -p 3000:3000 decionis/steward:<version>
```

Open <http://localhost:3000>. Every review control is captioned "Records a review only; no
downstream limit is changed."

Live mode runs against a Decionis tenant. The session comes from the Decionis sign-in handoff;
the container never holds a credential of its own.

```bash
docker run --rm -p 3000:3000 \
  -e STEWARD_DATA_MODE=live \
  -e DECIONIS_API_BASE_URL=https://api.decionis.com \
  decionis/steward:<version>
```

The process refuses to start in live mode without a base URL, and a live API failure is an error,
never a fall-back to demo fixtures. `GET /api/health` answers without a session for probes;
`/llms.txt` describes the deployment to an agent evaluating it.

## Verify it

```bash
gh attestation verify oci://docker.io/decionis/steward:<version> --repo decionis/steward
docker buildx imagetools inspect docker.io/decionis/steward:<version>
```

The manifest carries BuildKit's SBOM and provenance attestations for both architectures; the
`inspect` digest equals the GHCR one for every version, and a difference is a reason to stop and
report it. Mirror the image into your own registry before a cluster pulls it.

## What is free, and what is not

All of Steward is Apache-2.0 and this image is the whole of it. What Decionis sells is the platform
behind it: policy evaluation, execution grants, Decision Dossiers, the audit ledger, connectors,
identity and support. Commerce enters at one point, the first review that is meant to execute
rather than only be recorded. The boundary and the commitments about it are in
[OpenCore.md](https://github.com/decionis/steward/blob/master/OpenCore.md).
