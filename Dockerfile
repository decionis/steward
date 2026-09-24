# Deployable image for Decionis Steward.
#
# Defaults to demo mode, which is what the public demo deployment runs: no
# Decionis credentials, deterministic fixtures, nothing persisted. Set
# STEWARD_DATA_MODE=live and DECIONIS_API_BASE_URL to run it against the
# platform; StewardRuntimeConfig fails at startup rather than degrading if live
# mode is selected without a base URL. The image holds no configuration and no
# credential, checks no license and reports nothing: it is the same bytes for a
# free tenant and a paying one (OpenCore.md).
#
#   docker run -p 3000:3000 ghcr.io/decionis/steward:<version>              # demo
#   docker run -p 3000:3000 -e STEWARD_DATA_MODE=live \
#     -e DECIONIS_API_BASE_URL=https://api.decionis.com \
#     ghcr.io/decionis/steward:<version>                                     # live
#
# The base is pinned by digest and pulled from the AWS public mirror of the
# Docker library, so an unauthenticated CI runner is not rate-limited by Docker
# Hub and a rebuild of the same commit starts from the same bytes. Dependabot's
# docker ecosystem moves the digest on purpose.
ARG NODE_BASE_IMAGE=public.ecr.aws/docker/library/node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

# ---- deps -------------------------------------------------------------------
# The install and the build run on the builder's own platform whatever the
# target. The application is JavaScript; the one native addon in the tree is
# sharp, which Next loads only for next/image, and this application does not
# use next/image. Emulating an arm64 install under QEMU on an amd64 runner is
# where the sibling repository's release job once hung for thirty minutes.
FROM --platform=$BUILDPLATFORM ${NODE_BASE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate
COPY package.json pnpm-lock.yaml ./
# --frozen-lockfile so the image cannot silently resolve a different tree than
# the one CI audited.
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM ${NODE_BASE_IMAGE} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time NODE_ENV=production would make StewardRuntimeConfig default to
# live and demand DECIONIS_API_BASE_URL. next build sets what it needs itself.
# public/ is created if the tree has none, so the runtime COPY below never
# fails on a checkout that predates the discovery files it carries.
RUN pnpm build && mkdir -p public

# ---- runtime ----------------------------------------------------------------
# Per platform: this is the only stage whose bytes differ between amd64 and
# arm64, and it copies build output rather than compiling anything.
FROM ${NODE_BASE_IMAGE} AS runner
ARG VERSION=0.0.0-dev
ARG REVISION=unknown
ARG CREATED=1970-01-01T00:00:00Z
LABEL org.opencontainers.image.source="https://github.com/decionis/steward" \
      org.opencontainers.image.url="https://github.com/decionis/steward#readme" \
      org.opencontainers.image.documentation="https://github.com/decionis/steward/blob/master/docs/Docker.md" \
      org.opencontainers.image.title="Decionis Steward" \
      org.opencontainers.image.description="The open-source customer support decisioning platform: see what is happening across accounts, triage one queue with the evidence behind each recommendation, act before the customer asks. Decisions recorded and executed by Decionis. Holds no policy, credential or customer data." \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Decionis, Inc." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"
WORKDIR /app

ENV NODE_ENV=production \
    STEWARD_DATA_MODE=demo \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Run unprivileged. node:alpine already ships a "node" user. wget is for the
# health check only; nothing at run time needs a shell.
RUN apk add --no-cache wget

# output: "standalone" emits a self-contained server, but static assets are
# emitted separately and must be placed alongside it, and public/ (the
# discovery files, served at /llms.txt) is not part of either.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# /api/health is exempt from the session middleware precisely so probes work.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
