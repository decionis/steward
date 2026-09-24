# Run in Docker

The image is Steward's standalone Next.js server, built by the
[image workflow](../.github/workflows/image.yml) for `linux/amd64` and `linux/arm64`, running as
the unprivileged `node` user, with no configuration and no credential inside it.

```text
ghcr.io/decionis/steward:<version>     immutable: use this in production
ghcr.io/decionis/steward:<major>.<minor>
ghcr.io/decionis/steward:<major>
ghcr.io/decionis/steward:latest        moves with releases; never in production
ghcr.io/decionis/steward:edge          moves with master; for trying tomorrow's build
```

The same manifest list is on Docker Hub as `docker.io/decionis/steward` under the four release
tags. It is not a second build: after each release the
[Docker Hub workflow](../.github/workflows/dockerhub.yml) copies the release's manifest from GHCR
by digest, refuses a copy whose digest differs, and attests the Docker Hub name with the same
keyless workflow identity. One digest names the release on both registries. Docker Hub applies
pull-rate limits to anonymous clients; a cluster that pulls often should authenticate to it, pull
from GHCR, or mirror.

> Availability: the image is published by the image workflow from `v0.3.0` on; the tag is the
> release version, and `edge` has followed `master` since the workflow merged. For anything older,
> build it from a clone: `docker build -t decionis-steward .`

## Demo mode

The default. Deterministic fixtures, a fixture operator with `ADMIN` and `APPROVER` roles, nothing
persisted, no downstream action executed, the whole review flow.

```bash
docker run --rm -p 3000:3000 ghcr.io/decionis/steward:<version>
```

Open <http://localhost:3000>. The interface carries a `DEMO EVIDENCE` badge and every review control
is captioned "Records a review only; no downstream limit is changed."

## Live mode

Against a Decionis tenant. The operator's session comes from the Decionis sign-in handoff as
cookies; the container never holds a credential of its own, and the browser never contacts the
platform directly.

```bash
docker run --rm -p 3000:3000 \
  -e STEWARD_DATA_MODE=live \
  -e DECIONIS_API_BASE_URL=https://api.decionis.com \
  ghcr.io/decionis/steward:<version>
```

`StewardRuntimeConfig` refuses to start in live mode without a base URL rather than degrading, and
a live API failure surfaces as an error, never as demo fixtures. The
[README](../README.md#configuration) lists every variable; none is required beyond these two, and a
server-to-server token (`DECIONIS_STEWARD_SERVICE_TOKEN`) is optional and should be mounted from a
secret rather than passed on the command line.

A compose file for the same thing:

```yaml
services:
  steward:
    image: ghcr.io/decionis/steward:<version>
    ports: ["3000:3000"]
    environment:
      STEWARD_DATA_MODE: live
      DECIONIS_API_BASE_URL: https://api.decionis.com
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
```

## Health, discovery, shutdown

`GET /api/health` answers without a session, which is what the image's `HEALTHCHECK` and a load
balancer's probe need. `GET /llms.txt` describes the deployment to an agent evaluating it, also
without a session. `SIGTERM` (`docker stop`) stops the server.

## Verify the image

```bash
gh attestation verify oci://ghcr.io/decionis/steward:<version> --repo decionis/steward
docker buildx imagetools inspect ghcr.io/decionis/steward:<version>
```

The manifest carries BuildKit's SBOM and provenance attestations for both architectures, and the
image workflow attests the manifest digest with the same keyless identity that attests the release
tarball. The Docker Hub copy verifies the same way against its own attestation:

```bash
gh attestation verify oci://docker.io/decionis/steward:<version> --repo decionis/steward
docker buildx imagetools inspect docker.io/decionis/steward:<version>
```

The two `inspect` digests are equal for every version; a difference is a reason to stop and to
report it. Mirror the image into your own registry before a cluster pulls it, so a registry outage
or a rate limit cannot take a rollout down with it.

## What the image holds, and does not

It holds the built server, its static assets and `public/`. It does not hold a policy, a credential,
a connector secret, a database or customer data; the [threat model](../ThreatModel.md) lists what
a compromise of this tier can and cannot reach. It checks no license and makes no outbound request
to any host but the configured `DECIONIS_API_BASE_URL`. The same bytes serve a free tenant and a
paying one; see [OpenCore.md](../OpenCore.md).

The base image is `node:22-alpine`, pinned by digest and pulled from the AWS public mirror of the
Docker library; Dependabot moves the digest monthly in a pull request of its own.
