# WHY `next start` AND NOT `.next/standalone`: `frontend/next.config.ts` does not set
# `output: 'standalone'`, so `next build` never emits `.next/standalone/` and the previous
# runtime stage — `COPY --from=builder /app/frontend/.next/standalone ./` — copied a directory
# that does not exist and failed the build outright. Editing that config to switch the output
# mode is owned by another change; until it lands, the correct and working combination for this
# repository is a full `next build` plus `next start`, which is what this file does. The cost is
# a larger runtime image (the whole production `node_modules`, `next` included, has to be
# present) — the honest price of not tracing the build, called out here rather than hidden by a
# half-enabled standalone mode.
#
# The base-image tag reasoning is the same as `backend/Dockerfile`: a digest pin would go stale
# on the next Node patch and break the unattended deploy workflows, so the `22-alpine` minor is
# pinned instead and the residual risk is recorded, not omitted.
FROM node:22-alpine AS builder
WORKDIR /app

# WHY THE MANIFESTS ARE COPIED BEFORE THE SOURCE: `next build` is the expensive step, and it
# depends on both the source and the dependency graph. Copying only `package.json` files first
# keeps the `npm ci` layer cached across source-only edits, and keeps the workspace-package
# copies below independent of each other.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY frontend/package.json ./frontend/

# WHY `-w frontend` AND NOT A BARE `npm ci`: a root install would also pull in the backend
# workspace's dependencies — `@aws-sdk/*`, `drizzle-orm`, `pg`, `bcrypt`, `winston` — none of
# which is an input to a Next build. `-w frontend` installs the frontend workspace against the
# root lockfile and links `@hakawi/shared-types` as the workspace package it is. That link is
# not optional: `frontend/package.json` declares `"@hakawi/shared-types": "*"`, the package is
# `"private": true` and unpublished, and without root + workspace manifests in the context
# before the install, npm resolves it from the registry and 404s. This is the defect that made
# the previous frontend build fail.
RUN npm ci -w frontend --include-workspace-root

# WHY THIS `ENV` SITS AFTER `npm ci` AND NOT BEFORE IT: `npm ci` reads NODE_ENV=production as
# "skip devDependencies", and this build needs them — `@tailwindcss/postcss` compiles globals.css.
# Placed here, it fixes the config-load-time environment `next.config.ts` reads `NODE_ENV` from,
# which makes the CSP's eval-blocked guarantee STRUCTURAL — decided by this image — instead of
# inherited from Next's `NODE_ENV` default. `verify:csp` after the build still asserts the artifact
# that ships, so it is belt-and-braces rather than the only check.
ENV NODE_ENV=production

# --- shared-types: BUILT HERE, NOT COPIED FROM THE HOST ------------------------------------------
# `frontend/src` imports `@hakawi/shared-types`, and `next.config.ts` lists it in
# `transpilePackages`, so the build resolves its entry `./dist/index.js` and transpiles that
# source. Without `packages/shared-types/dist` present, both the resolution and the type check
# fail. The previous Dockerfile never built or copied it at all. It is its own layer, so it is
# cached independently of the frontend source.
COPY packages/shared-types/ ./packages/shared-types/
RUN npm run build --workspace=packages/shared-types

# --- frontend -------------------------------------------------------------------------------------
# The last layer, because the frontend source is what changes on every commit. `.dockerignore`
# has already stripped `frontend/.next`, `frontend/coverage`, `frontend/node_modules`,
# `frontend/tsconfig.tsbuildinfo` and every `.env*` from what arrives here, so nothing stale and
# nothing secret reaches a layer.
COPY frontend/ ./frontend/

# --- the origins the BROWSER is given are decided HERE, not at runtime ---------------------------
# `NEXT_PUBLIC_*` is INLINED into the client bundle at build time. The pod's environment
# cannot change it afterwards: the variable the Helm chart sets on the running container is
# read by the SERVER, and the browser is already holding the address the build baked in.
#
# So every origin the browser is told about has to be a build argument. Without this, the
# client bundle carried the development default — `http://localhost:3001/api/v1` — and every
# deployed browser was asking its own machine for the API.
#
#   NEXT_PUBLIC_API_URL     the API the browser calls
#   NEXT_PUBLIC_APP_URL     this app's own origin: the canonical links, the sitemap, the robots
#                           file and the `metadataBase` every `og:image` is resolved against
#   NEXT_PUBLIC_PAYMOB_ORIGIN  the payment gateway the checkout is allowed to frame
#
# An argument that is not passed stays empty, and every one of these has a fallback in the code
# — an empty string is falsy, so the fallback wins and the build still succeeds.
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_PAYMOB_ORIGIN=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PAYMOB_ORIGIN=$NEXT_PUBLIC_PAYMOB_ORIGIN

RUN npm run build --workspace=frontend

# WHY THE CSP IS ASSERTED INSIDE THE IMAGE BUILD AND NOT ONLY IN CI: the header
# is decided when `next.config.ts` is LOADED and serialized into
# `.next/routes-manifest.json` at build time, and `next start` serves it from
# that manifest — so the artifact that ships is the only one worth asserting.
# CI runs the same check on its own build (`.github/workflows/ci.yml`), but the
# deployed image comes from THIS build, and without the assertion here the
# shipped artifact's eval-blocked guarantee rests on Next's `NODE_ENV` default
# alone. A policy that names `'unsafe-eval'` therefore fails the image build
# instead of reaching a registry. `.dockerignore` keeps `frontend/scripts/` in
# the context, and the script resolves its own path, so the `WORKDIR` here is
# irrelevant to it.
RUN npm run verify:csp --workspace=frontend

# =================================================================================================
# Runtime
# =================================================================================================
FROM node:22-alpine AS runtime
# WHY THE INSTALL RUNS WITH `WORKDIR /app` AND NOT `/app/frontend`: the root `package.json`,
# the root `package-lock.json` and the `packages/shared-types/` manifest must sit at `/app`,
# because that is the monorepo root npm expects when `-w frontend` resolves the workspace graph.
# An earlier revision of this stage set `WORKDIR /app/frontend` and copied these manifests to
# `./` — which silently put the ROOT manifest at `/app/frontend/package.json`, the frontend's own
# manifest at `/app/frontend/frontend/package.json` and nothing at `/app` at all. `npm ci` still
# exited 0, because npm treated `/app/frontend` as the workspace root of a brand-new monorepo and
# hoisted every dependency into `/app/frontend/node_modules`. The build looked successful while
# the runtime had `next` in a place no CMD could find, and the `@hakawi/shared-types` symlink
# pointed at a directory its `dist` had never been copied into. A COPY destination is resolved
# against the WORKDIR in force at that moment, and that is the whole failure.
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Explicit rather than implicit: `next start` must bind every interface inside a container, and
# relying on a default that changed between Next majors is how a working image starts answering
# connection-refused on a published port.
ENV HOSTNAME=0.0.0.0
# WHY BOTH `.bin` DIRECTORIES ARE ON `PATH`, AND WHY THE HOPED-FOR SINGLE ONE IS NOT ENOUGH: npm
# WORKSPACES DO NOT GUARANTEE WHERE A BINLINK LANDS. With this install the graph is hoisted, so
# `next` is linked into `/app/node_modules/.bin`; but npm is free to nest a conflicting package
# into the workspace's own `node_modules`, and then its binlink appears only in
# `/app/frontend/node_modules/.bin`. Both layouts are legitimate npm output for the same
# lockfile, and a PATH that names only one of them turns the other into a container that fails at
# startup with `Cannot find module`. This is not hypothetical — the mis-rooted revision above is
# exactly how that error was found. Naming both costs nothing and removes the dependency on npm's
# internal placement decision, which is precisely the kind of implicit coupling a Dockerfile
# should not carry into production.
ENV PATH="/app/node_modules/.bin:/app/frontend/node_modules/.bin:${PATH}"
EXPOSE 3000

# WHY A NEW ACCOUNT AT 10001 AND NOT THE STOCK `node` AT 1000: `infrastructure/helm/frontend/
# values.yaml` sets `podSecurityContext.runAsUser: 10001`, `runAsGroup: 10001` and `fsGroup:
# 10001`. The image therefore creates the matching account, so the identity that runs the
# process here is the identity the orchestrator grants the volume and the network to. Note this
# deliberately differs from the backend image (1000, matching the backend chart's own value) —
# the two charts do not agree with each other, and each image follows its own chart rather than
# being "fixed" to a single number here.
RUN addgroup -g 10001 -S nextjs \
    && adduser -S -u 10001 -G nextjs nextjs

# Production dependencies only. `-w frontend` keeps the backend's runtime out of this image, and
# `--include-workspace-root` keeps the root workspace's own dependencies; `--omit=dev` drops the
# toolchain (`typescript`, `eslint`, `vitest`, `playwright`, `tailwindcss`) that only the builder
# needed. Where npm places these — hoisted at `/app/node_modules` or nested under the workspace —
# is npm's decision, which is why the `PATH` above names both `.bin` directories rather than one.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY frontend/package.json ./frontend/
RUN npm ci -w frontend --include-workspace-root --omit=dev \
    && npm cache clean --force

# THE BUILT OUTPUT AND NOTHING ELSE, owned by the account that runs it. `--chown` here rather
# than a later `chown -R`, because a second `RUN` to fix ownership would duplicate the whole
# tree into another layer and double the size of the image.
#
# WHY THE DESTINATIONS ARE ABSOLUTE PATHS AND NOT `./`: the `WORKDIR` above is `/app`, so a
# `./`-relative destination would put `.next` at `/app/.next` — outside the app directory, where
# `next start` would never find it. `/app/frontend/...` names the same place the builder built,
# independently of whatever the current WORKDIR happens to be.
COPY --chown=nextjs:nextjs --from=builder /app/frontend/.next /app/frontend/.next
COPY --chown=nextjs:nextjs --from=builder /app/frontend/public /app/frontend/public
# `next start` loads this file at boot (it is where basePath, redirects, headers and image
# config live), so it has to be present even though in this repository it only sets
# `transpilePackages`, which matters at build time and not at runtime.
COPY --chown=nextjs:nextjs --from=builder /app/frontend/next.config.ts /app/frontend/next.config.ts
# Belt and braces: the build inlines `@hakawi/shared-types` because it is in
# `transpilePackages`, so the runtime does not strictly need it. A few kilobytes that keep the
# image working if that setting is ever removed is cheaper than a runtime
# MODULE_NOT_FOUND on a route nobody tests manually. It must land at `/app/packages/...` and not
# under `/app/frontend/...`: the binlink npm created at
# `/app/node_modules/@hakawi/shared-types` resolves through its own relative `../../`, which
# points at `/app/packages/shared-types`.
COPY --chown=nextjs:nextjs --from=builder /app/packages/shared-types/dist /app/packages/shared-types/dist

# The process runs here, and this is also where `next` is resolved from by the CMD below.
WORKDIR /app/frontend

USER nextjs

# WHY `CMD ["sh", "-c", ...]` AND NOT THE OBVIOUS `CMD-SHELL`: `CMD-SHELL` is a BuildKit-only
# feature, and a plain `docker build` wherever BuildKit is absent — as on any machine without the
# buildx component — fails outright with `Unknown type "CMD-SHELL" in HEALTHCHECK`. Writing the
# shell invocation as the argument to `sh` inside a plain `CMD` is valid for both builders. The
# same `${PORT:-3000}` reasoning as `backend/Dockerfile`: Docker records the probe verbatim, so
# the shell resolves `PORT` at CHECK time from the container's real environment.
#
# WHY `wget` AND NOT `curl`: alpine ships busybox `wget`; `curl` would mean an extra package and
# an extra update channel in a production image purely to run a liveness probe. `wget --spider`
# exits 0 only on a 2xx and non-zero on both 404 and connection-refused, which was verified
# against this image's base before being written down here.
#
# WHY `/` AND NOT `/api/health`: there is no backend behind this image, and the frontend's own
# root route renders server-side without calling anything (see `src/app/(app)/page.tsx` — it is
# a client component that fetches in an effect), so a 200 from `/` proves the server is
# compiling and serving. `infrastructure/helm/frontend/values.yaml` advertises
# `prometheus.io/path: "/api/health"`, which this application does not serve — that is a chart
# defect for its owner, and it is another reason the image must not depend on it.
#
# `--start-period` covers the first-request compile, which is the slow part of a cold Next
# server and would otherwise burn the retry budget on a perfectly healthy container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["sh", "-c", "wget --spider -q http://127.0.0.1:${PORT:-3000}/ || exit 1"]

# `next` by name, resolved through the `PATH` set above, rather than a deep path into
# `next/dist/bin` that a Next major is free to move. The `.bin` symlink is the stable npm
# contract; its hoisted location is the reason for that `PATH` entry.
CMD ["next", "start"]
