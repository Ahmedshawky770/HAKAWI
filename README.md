# Hakawi

An Arabic-language storytelling platform. NestJS + PostgreSQL + Valkey on the API, Next.js App Router
on the web, in an npm-workspaces monorepo.

> **This README is meant to be true.** Every command below was checked against the scripts that
> actually exist in this repository. Where something is not built, it is listed as not built — see
> [Status](#status) — rather than described as if it were. Coverage percentages, test counts and
> performance claims are deliberately omitted: this repository cannot evidence them, and a number that
> cannot be re-derived is worse than no number.

## Layout

| path | what |
| --- | --- |
| `backend/` | NestJS API. Vitest + Supertest. Serves under the `api/v1` prefix. |
| `frontend/` | Next.js App Router UI. Vitest + Testing Library; Playwright drives a real browser. |
| `packages/shared-types/` | shared types and enums, imported by both workspaces as `@hakawi/shared-types`. Built to `dist/`, which is **gitignored** — so it must be built before anything typechecks. |
| `migrations/` | the applied SQL history, plus `down/` rollback scripts and `meta/`. See [`migrations/README.md`](migrations/README.md). |
| `docs/` | architecture, security, data and development documentation. Start at [`docs/00_INDEX.md`](docs/00_INDEX.md). |

## Prerequisites

- **Node.js 22** and npm 10+. CI pins Node 22; `@types/node` is on the 24 line.
- **Docker with Compose**, for PostgreSQL 15 and Valkey 8.

There are **3 `Dockerfile`s** in this repository: a multi-stage root `Dockerfile`, `backend/Dockerfile`, and `frontend/Dockerfile`. Compose runs the datastores as images and both applications from bind-mounted source for local development. See [Status](#status).

## Setup

```bash
# 1. Dependencies, once, from the repository root. This installs all three workspaces.
npm ci

# 2. `@hakawi/shared-types` resolves through node_modules -> dist, and dist/ is gitignored, so it
#    must be built before anything typechecks. Required for BOTH workspaces.
npm run build:shared-types

# 3. Datastores only — the fastest path, and what you want if you are running the apps on the host.
docker compose up -d postgres valkey

# 4. Schema and seed data.
npm run migration:run
npm run seed:dev
```

Step 3 does **not** need a `.env` file: every value in `docker-compose.yml` has a `${VAR:-default}`
fallback, so the datastores come up with no configuration. Bringing up the **whole** stack
(`docker compose up`) also works without one, for the same reason.

If you would rather run everything in containers, `docker compose up` starts both applications too,
applies migrations before the API boots, and serves the web on `:3000` and the API on `:3001`.

### Backend environment

The API reads `backend/.env`. Copy the example and edit it:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

`backend/.env.example` documents every variable, including several that are deliberately **not read by
any code** — it is annotated as such so nobody wires them up expecting an effect.

Two variables are load-bearing and have no safe default:

| variable | why |
| --- | --- |
| `JWT_SECRET` | `public-secret.ts` refuses the published non-production default when `NODE_ENV=production`, so a missing value in production is a **boot failure** rather than a service that mints forgeable tokens. |
| `PAYMOB_API_KEY`, `PAYMOB_MERCHANT_ID`, `PAYMOB_INTEGRATION_ID` | **No production guard.** They fall back to `sandbox-*` values and the app boots healthy while failing every real checkout. Set them explicitly, and set `PAYMOB_ENVIRONMENT=live`. |

## Run

```bash
npm run dev          # both servers, concurrently
npm run dev:backend  # API on :3001
npm run dev:frontend # web on :3000
```

Verify:

```bash
curl http://localhost:3001/api/v1/       # service index: name, version, docs path, live health
curl http://localhost:3001/api/v1/health # { status, database, valkey, timestamp }
```

The global prefix `api/v1` is set at `backend/src/main.ts`. Both routes above stay `200` even when a
dependency is down and carry the degradation in `health.status` instead — an index that 500s when the
database is unreachable is useless to the probe that most needs it. **They are therefore not usable as
a Kubernetes readiness probe as written**; see [Status](#status).

OpenAPI is served at `/api/v1/api/docs` unless `ENABLE_SWAGGER=false`. It is enabled by default,
including in production.

## Test

```bash
npm test                                          # backend unit
npm run test:cov --workspace=backend              # unit + the coverage gate
npm run test:e2e --workspace=backend              # integration + e2e, needs a migrated database
npm run test:run --workspace=frontend             # frontend unit
npm run test:coverage --workspace=frontend        # frontend + its coverage gate
npm run test:e2e --workspace=frontend             # Playwright, drives a real browser
npm run lint && npm run typecheck                 # both workspaces
```

The backend coverage gate is `backend/vitest.config.ts` — global floors plus nine per-path ratchets.
The frontend gate is much lower than the backend's; see [Status](#status).

`npm run test:e2e --workspace=backend` needs a **running, migrated** PostgreSQL and Valkey, and it
builds its own schema, so no separate migration step is required for it.

The Playwright suite lives in `frontend/e2e/` and is driven by `frontend/playwright.config.ts`, which
boots both servers itself. It runs the API-critical-path checks as well as the browser journeys.

## Migrations

```bash
npm run db:check         # structural lint, no database
npm run migration:status # per-file state, applied-at, reversibility
npm run migration:list   # files + checksums, no database
npm run migration:verify # checksum drift against a live database
npm run migration:create -- add_story_pinned
npm run migration:rollback -- --to 0004     # or --steps N, or --allow-data-loss
```

Hand-written `.sql` under a sha256 content-checksum ledger. **Do not** use `drizzle-kit generate` for
history: its output directory is gitignored, and the applied history is the hand-written chain.
`migrations/down/` carries a rollback script per migration whose first line declares
`reversibility` and `data-loss`; `db:check` rejects a missing script or an unreplaced placeholder.

`0017` is a **permanent hole** in the numbering — `migration:create` allocates `max + 1` and never
fills a gap. Read [`migrations/README.md`](migrations/README.md) before adding one.

Two migrations refuse to apply on data they cannot fix safely, and name the offending rows instead of
choosing for you:

| migration | refuses when | why |
| --- | --- | --- |
| `0020_add_stories_slug_unique` | two stories already share a `slug` | picking a survivor would silently rewrite a published URL |

`0019_backfill_denormalised_counters` re-counts from the source tables rather than adding a delta, so it
always applies and is safe to re-run.

## CI

`.github/workflows/ci.yml`, **10 jobs**: `lint`, `test-unit`, `test-frontend`, `test-coverage`,
`test-e2e`, `test-browser`, `migration-premerge`, `migration-verify`, `security`, `build`.

Gates: the coverage thresholds, `npm audit --omit=dev` (hard-failing), `db:check`, and a from-scratch
migration apply + verify + re-apply idempotency check.

Two caveats worth knowing before you trust a green build:

- `migration-verify` is gated on `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`,
  so on a pull request it reports **skipped**, not passed.
- `build` lists eight of the nine upstream jobs in its `needs:` and omits `migration-verify`. A green
  `build` therefore does not prove the from-scratch migration chain applied.

## Status

Not built. Listed because a feature's absence is a fact a reader needs, and because the alternative —
documenting an aspiration as a capability — is what this README exists to avoid.

| area | state |
| --- | --- |
| Docker image / deployment | **3 `Dockerfile`s exist** (root, backend, frontend). No deploy manifest, no IaC. Compose runs datastores plus source-mounted apps, for local development only. |
| Backup & restore | Documented in `docs/deployment/`. Backup script with verification and S3 replication in `scripts/`. GitHub Actions daily backup job. Restore drill script in `scripts/`. |
| Migrations rollback | `migrations/down/` exists for every migration and `db:check` verifies it structurally. CI now runs up → down → up roundtrip (`migration-roundtrip` job). |
| Email delivery | **SMTP client implemented** (`SmtpEmailTransporter` in `modules/notifications/email/`). `EmailTransporter` interface wired in `NotificationsModule`. |
| MFA, account lockout | **Account lockout implemented** (`AccountLockoutService` in `modules/auth/`). Progressive delay, IP + user tracking, auto-unlock. MFA not implemented. |
| Alerting | **Alert rules configured** (`monitoring/alertmanager/alertmanager.yml`, `monitoring/prometheus/rules/`). **Grafana dashboards** configured (`monitoring/grafana/dashboards/`). Sentry wired. |
| Load / performance testing | **k6 config exists** (`load-tests/k6.conf.js`). CI runs load test on main branch (`load-test` job). |
| Read replicas | None. Single primary; no replication-lag monitoring. |
| WAF administration | **Admin endpoints implemented** (`GET/POST /admin/waf/*` in `modules/admin/`). IP blocklist management, violation clearing. |
| Geo-blocking | `WAF_BLOCKED_COUNTRIES` is parsed into `reservedBlockedCountries` and deliberately inert. It has no GeoIP source, and enforcing on a client-supplied country header would be forgeable. |
| Production configuration | **Production env template** (`backend/.env.production.template`). `NODE_ENV` must be exactly `production` for secret checks to arm. `THROTTLE_TRUST_PROXY` must be `true` behind reverse proxy. |

## Where things are written down

| topic | file |
| --- | --- |
| documentation index | `docs/00_INDEX.md` |
| architecture principles | `docs/01_ARCHITECTURE_PRINCIPLES.md` |
| module boundaries | `docs/module-boundaries/` |
| security model | `docs/security-architecture/` |
| WAF | `docs/security-architecture/waf/waf-overview.md`, `backend/src/common/waf/README.md` |
| guards, and why each is wired where it is | `backend/src/common/guards/README.md` |
| data & migrations | `docs/data-architecture/`, `migrations/README.md` |
| development setup | `docs/development/setup.md` |
| roadmap, phase by phase | `docs/roadmap/phases/implementation-roadmap.md` |
| API contract | `docs/api-contract/` |
| what changed and why | `CHANGELOG.md` |
| decision records | `docs/adr/` |

## Contributing

There is no `CONTRIBUTING.md` and no `LICENSE` file; every `package.json` declares `"UNLICENSED"`.
Commit messages follow Conventional Commits.
