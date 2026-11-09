# ABOUT THIS FILE. The three deploy workflows (`.github/workflows/deploy-{dev,staging,
# production}.yml`) build ONLY `./backend/Dockerfile` and `./frontend/Dockerfile`, each tagged and
# pushed separately. This root file is consequently not exercised by CI, but it is not dead
# either: it is referenced as an existing artifact by `README.md`, `docs/deployment/backup.md`,
# `docs/roadmap/milestones/milestones.md`, `docs/roadmap/deliverables/deliverables.md` and
# `docs/system-architecture/non-functional-requirements.md`, and `docs/roadmap/phases/
# implementation-roadmap.md` describes it as the root image for local/production image builds.
# Deleting it would invalidate five documents; fixing it to the same standard as its two siblings
# is the change that keeps them true. Same base-image pinning reasoning as `backend/Dockerfile`:
# a digest would go stale on the next Node patch and there is no CI job to refresh it.
FROM node:22-alpine AS deps
WORKDIR /app

# WHY ALL THREE MANIFESTS, UNLIKE THE PER-SERVICE FILES: this image carries the output of ALL
# workspaces, so its dependency graph is all of them. A filtered `npm ci -w <one>` here would
# leave the other workspace's build failing at module resolution.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# A full install, dev dependencies included: both builds need their toolchains (`tsc` for the
# backend and shared-types, the Next toolchain for the frontend), and separating prod from dev
# installs would mean running the expensive step twice for no gain in an image that is not built
# by CI on every commit. The root `.dockerignore` still keeps the host's `node_modules` out, so
# this resolves from the committed lockfile and from nothing else.
RUN npm ci

# --- shared-types: BUILT ONCE, SHARED BY BOTH BUILDERS -------------------------------------------
# One stage, one layer, inherited by both builders below. `@hakawi/shared-types` is a
# `"private": true` workspace package whose `exports` point at `./dist/index.js`, and both
# `backend/src` and `frontend/src` import it — so both builds need this `dist` and neither may
# take it from the host (a stale-artifact hazard, and incompatible with an `.dockerignore` that
# excludes `**/dist`).
FROM deps AS shared-types-builder
WORKDIR /app
COPY packages/shared-types/ ./packages/shared-types/
RUN npm run build --workspace=packages/shared-types

# --- backend ---------------------------------------------------------------------------------------
# Stage inheritance, not a second `npm ci`: `FROM deps` means the `node_modules` built above is
# already here, and `FROM shared-types-builder` means the shared-types `dist` this build
# type-checks against is already here too.
FROM shared-types-builder AS backend-builder
WORKDIR /app
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# --- frontend --------------------------------------------------------------------------------------
FROM shared-types-builder AS frontend-builder
WORKDIR /app
COPY frontend/ ./frontend/
RUN npm run build --workspace=frontend

# ==================================================================================================
# Runtime
# ==================================================================================================
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# This image serves the frontend on 3000 (see the CMD), so the bind address and its runtime
# identity are the frontend's. `infrastructure/helm/frontend/values.yaml` sets
# `runAsUser: 10001` / `runAsGroup: 10001` / `fsGroup: 10001`, and the account below matches it.
# The backend chart's `runAsUser: 1000` does not apply to an image whose CMD is the web server;
# the backend has its own image for that, and the two charts' disagreement is recorded in
# `frontend/Dockerfile` rather than resolved here.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# WHY BOTH `.bin` DIRECTORIES ARE ON `PATH`: npm WORKSPACES DO NOT GUARANTEE WHERE A BINLINK
# LANDS. The hoisted graph links `next` into `/app/node_modules/.bin`, but npm is free to nest a
# conflicting package into `/app/frontend/node_modules`, and then that binlink appears only in
# the workspace's own `.bin`. Both are legitimate output for the same lockfile, so naming only
# one turns the other into a container that dies at startup with `Cannot find module`. See
# `frontend/Dockerfile`, where a mis-rooted `WORKDIR` made this concrete.
ENV PATH="/app/node_modules/.bin:/app/frontend/node_modules/.bin:${PATH}"
RUN addgroup -g 10001 -S nextjs \
    && adduser -S -u 10001 -G nextjs nextjs

# Production dependencies for every workspace this image carries. `--omit=dev` drops the
# toolchains both builders used.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev \
    && npm cache clean --force

# What each builder produced, and only that. Each `COPY` is `--chown`ed to the account that runs
# the process, because a later root-owned tree is how an image that works locally becomes an
# EACCES in the cluster.
COPY --chown=nextjs:nextjs --from=frontend-builder /app/frontend/.next /app/frontend/.next
COPY --chown=nextjs:nextjs --from=frontend-builder /app/frontend/public /app/frontend/public
# `next start` loads the config at boot (basePath, redirects, headers), so it has to be present
# even though in this repository it only sets `transpilePackages`, which matters at build time.
COPY --chown=nextjs:nextjs --from=frontend-builder /app/frontend/next.config.ts /app/frontend/next.config.ts

# This image runs BOTH services: the frontend on 3000 and the backend on 3001.
# The backend's compiled output is also copied so the image carries the full
# repository build, and the start-all.sh script launches both processes.
COPY --chown=nextjs:nextjs --from=backend-builder /app/backend/dist /app/backend/dist
# Belt and braces for the same reason as `frontend/Dockerfile`: the build inlines
# `@hakawi/shared-types` through `transpilePackages`, so the runtime does not need it, and a few
# kilobytes keep the image working if that setting is ever removed.
COPY --chown=nextjs:nextjs --from=shared-types-builder /app/packages/shared-types/dist /app/packages/shared-types/dist

# The start-all.sh script runs both services: backend (3001) and frontend (3000).
COPY --chown=nextjs:nextjs scripts/start-all.sh /app/scripts/start-all.sh
RUN chmod +x /app/scripts/start-all.sh

# The frontend is served from this directory, so WORKDIR is here so `next start` can find the `.next` directory.
WORKDIR /app/frontend

ENV BACKEND_PORT=3001

USER nextjs

# Healthcheck probes both services: frontend root route and backend /api/v1/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["sh", "-c", "wget --spider -q http://127.0.0.1:${PORT:-3000}/ && wget --spider -q http://127.0.0.1:${BACKEND_PORT:-3001}/api/v1/health || exit 1"]

EXPOSE 3000 3001

# Run both services via the start script.
CMD ["sh", "/app/scripts/start-all.sh"]
