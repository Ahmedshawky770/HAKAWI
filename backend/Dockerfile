# WHY THE TAG IS `node:22-alpine` AND NOT `node:22-alpine@sha256:...`: an immutable digest is
# strictly better for supply-chain reproducibility, but it goes stale the moment Node ships a
# patch release, and the three deploy workflows (`deploy-{dev,staging,production}.yml`) build
# this file unattended. A stale digest is a red pipeline with no way to fix it from here; a
# floating `alpine` patch tag is at least a security fix that arrives on its own. The residual
# risk — a bad patch release of 22.x reaching this image — is recorded here rather than hidden,
# and is accepted because the alternative is a manual pin bump per CVE. If the project later
# adopts digest pinning with Renovate to refresh them, this line is the one place to change.
FROM node:22-alpine AS builder
WORKDIR /app

# WHY THE COPY IS SPLIT INTO MANIFESTS FIRST, SOURCE LATER: `package.json` files change far
# less often than source, so the `npm ci` layer below survives a source-only edit and the
# expensive install is reused from cache. A single `COPY backend/ ./` before the install would
# invalidate that layer on every keystroke and make every build pay the full install cost.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/package.json ./backend/

# WHY `-w backend` AND NOT A BARE `npm ci`: a root install would also pull in the frontend
# workspace's dependencies — `next`, `react`, `react-dom`, the Tailwind and Playwright toolchain
# — which are not inputs to a Nest build. They cost hundreds of megabytes of build time and
# disk for nothing. `-w backend` installs the backend workspace against the root lockfile, and
# links `@hakawi/shared-types` as the workspace package it is instead of resolving it from the
# registry: the package is `"private": true` and unpublished, so a registry lookup 404s.
#
# WHY THE HOST'S `node_modules` CANNOT REACH THIS BUILD: the root `.dockerignore` excludes
# `**/node_modules`, so the only `node_modules` in the image is the one `npm ci` creates here
# from the committed lockfile. Identical lockfile in, identical `node_modules` out — that is
# what makes the image reproducible on a developer laptop and in CI alike.
RUN npm ci -w backend --include-workspace-root

# --- shared-types: BUILT HERE, NOT COPIED FROM THE HOST -----------------------------------------
# `backend/src` imports `@hakawi/shared-types`, whose `exports` map points at `./dist/index.js`
# and whose types point at `./dist/index.d.ts`. `nest build` runs `tsc`, which type-checks
# against those declarations: without `packages/shared-types/dist` present the backend build
# fails at module resolution. The previous Dockerfile copied the HOST's
# `packages/shared-types/dist` instead, which is a stale-artifact hazard — the image silently
# ships whatever the last machine to build happened to leave there — and it is incompatible
# with a `.dockerignore` that excludes `**/dist`. Building it here is its own layer, so it is
# cached independently of the backend source and invalidated only by a change to its own source.
COPY packages/shared-types/ ./packages/shared-types/
RUN npm run build --workspace=packages/shared-types

# --- backend -------------------------------------------------------------------------------------
# This is the layer that changes on every commit, so it goes last: everything above stays
# cached. `.dockerignore` has already stripped `backend/dist`, `backend/coverage`,
# `backend/node_modules`, every `*.tsbuildinfo` and every `.env*` from what arrives here, so
# nothing stale and nothing secret reaches a layer.
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# =================================================================================================
# Runtime. Only the artifacts and the production dependency graph cross the stage boundary.
# =================================================================================================
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3001

# Production dependencies only. `-w backend` keeps the frontend's runtime out of this image;
# `--include-workspace-root` keeps the root workspace's own dependencies; `--omit=dev` drops the
# toolchain (`typescript`, `@nestjs/cli`, `vitest`, `drizzle-kit`) that only the builder needed.
# The backend's CMD is `node dist/main.js` and needs no binlink, so unlike the frontend image
# this stage does not depend on where npm decides to place `.bin` entries.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/package.json ./backend/
RUN npm ci -w backend --include-workspace-root --omit=dev \
    && npm cache clean --force

# THE BUILT ARTIFACTS AND NOTHING ELSE. `--chown=node:node` because the process below runs as
# `node`, and a root-owned tree that the runtime user must read is the classic
# "works locally, EACCES in the cluster" defect. The backend's own output is the whole image:
# `dist/` plus the one workspace package it links.
COPY --chown=node:node --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --chown=node:node --from=builder /app/backend/dist ./dist

# WHY `USER node` AND NOT ROOT: `node:22-alpine` ships a `node` account with uid and gid 1000,
# which is exactly the `runAsUser: 1000` that `infrastructure/helm/backend/values.yaml` (and its
# staging and production variants) pairs with `runAsNonRoot: true`. Declaring the same identity
# in the image means a pod that starts under Kubernetes cannot discover at deploy time that it
# is running as an identity it was never granted — the mismatch is caught at build time instead.
#
# The build above runs as root and only switches here, so every `chown`-needing layer is
# already done. There is no further `RUN` after this point.
USER node

# WHY `CMD ["sh", "-c", ...]` AND NOT THE OBVIOUS `CMD-SHELL`: `CMD-SHELL` is a BuildKit-only
# feature. `docker buildx` is not installed on this machine, so a build run with the legacy
# builder — which is also what a plain `docker build` falls back to wherever BuildKit is absent —
# fails outright with `Unknown type "CMD-SHELL" in HEALTHCHECK`. Writing the shell invocation as
# the argument to `sh` inside a plain `CMD` is valid for both builders, so this file builds
# identically on a BuildKit CI runner and on a legacy-builder workstation.
#
# The `${PORT:-3001}` default is deliberately inside the `sh -c` string and NOT expanded by
# Docker at build time: Docker records a HEALTHCHECK verbatim (verified: a `${FOO:-default}`
# probe is stored unexpanded in the image config), so the shell resolves `PORT` at CHECK time
# from the container's real environment. A build-time expansion would have frozen whatever
# `PORT` happened to be during the build and then lied whenever Compose or the chart overrode it.
#
# WHY `wget` AND NOT `curl`: alpine's base image ships busybox `wget`; installing `curl` would
# add a package (and an update channel) to a production image purely to run a liveness probe.
# `wget --spider` exits 0 only on a 2xx and non-zero on both 404 and connection-refused, which
# was verified against this image before being written down here — a probe that cannot fail is
# worse than no probe, because it reports green for a dead server.
#
# WHY `/api/v1/health` AND NOT `/`: `main.ts` sets `app.setGlobalPrefix('api/v1')` and
# `AppController` declares `@Get('health')`, so the reachable route is `/api/v1/health`. A probe
# against `/` would answer the API index rather than the application, and a probe against
# `/health` would 404 forever and mark every container unhealthy.
#
# WHY THE PROBE STILL PASSES WHEN POSTGRES IS DOWN, AND WHY THAT IS CORRECT: `GET
# /api/v1/health` deliberately returns 200 with `status: "degraded"` when a dependency is
# unreachable (see `app.controller.ts`), so this check answers "is the HTTP server up", which is
# the question a container HEALTHCHECK is allowed to ask. Dependency truth belongs to the
# readiness probe, which is owned by the Helm chart and not by the image.
#
# `--start-period` covers `nest` bootstrap (Sentry, the WAF, the websocket adapter) before a
# failure is counted against the retry budget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["sh", "-c", "wget --spider -q http://127.0.0.1:${PORT:-3001}/api/v1/health || exit 1"]

CMD ["node", "dist/main.js"]
