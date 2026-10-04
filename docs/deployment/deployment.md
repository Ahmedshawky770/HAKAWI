# Deployment Guide
## Hakawi - Production Deployment

---

## Deployment Strategy

### Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| **Development** | Local development | http://localhost:3000 |
| **Staging** | Pre-production testing | https://staging.hakawi.com |
| **Production** | Live application | https://hakawi.com |

### Deployment Platforms

| Component | Platform | Status |
|-----------|----------|--------|
| **Frontend** | Vercel | Plausible. `next build` succeeds; the root `build` script builds shared-types first |
| **Backend** | Railway | ⛔ **Not deployable as written.** There is no `Dockerfile` in the repository — `find . -name "Dockerfile*"` returns nothing. Railway's container deploy has no artifact to build |
| **Database** | Railway Managed PostgreSQL | Plausible. Schema comes from `migrations/*.sql` |
| **Cache** | Railway Managed Valkey | Plausible. The Socket.IO adapter reads `valkey.*` through `ConfigService`, the same `VALKEY_*` family the cache uses. ⛔ there is still **no `Dockerfile` in the repository** |
| **Storage** | Cloudflare R2 | Plausible via the S3-compatible SDK. ⛔ there is no `STORAGE_ENDPOINT` variable |
| **Monitoring** | Sentry | ✅ Real. `@sentry/nestjs@11.1.0`, `common/observability/sentry.config.ts` |

**The deployment artifact is the gap.** Everything else in this table is a configuration decision;
the missing `Dockerfile` is a missing file. See
`docs/roadmap/phases/implementation-roadmap.md` → *Open Items*.

---

## Pre-Deployment Checklist

### Code Quality

- [ ] All backend unit tests pass — `npm test` (151 files / 3228 tests, includes the coverage gate)
- [ ] Backend e2e tests pass — `npm run test:e2e --workspace=backend` (23 files / 173 tests — 11 `src/**/e2e-spec.ts` + `test/app.e2e-spec.ts` + 11 `test/*integration-spec.ts`)
- [ ] Frontend tests pass — `npm run test:run --workspace=frontend` (22 files / 356 tests)
- [ ] Frontend coverage gate passes — `npm run test:coverage --workspace=frontend`
- [ ] Linting passes — `npm run lint` (0 errors)
- [ ] TypeScript passes — `npm run typecheck`
- [ ] Build passes — `npm run build` (shared-types → backend → frontend)
- [ ] No security vulnerabilities — `npm audit --omit=dev`

### Database

- [ ] All migrations applied — `npm run migration:run`
- [ ] Ledger verified, no drift — `npm run migration:verify`
- [ ] Chain linted — `npm run db:check` (static, no database)
- [ ] Migration rollback tested, including the reversibility classification
- [ ] ⚠️ **Database backup taken manually** — there is no automated backup. `pg_dump` first
- [ ] Migration script reviewed

### Configuration

- [ ] Environment variables set in the deployment platform — follow
      `docs/deployment/environment.md`, which mirrors `backend/.env.example`
- [ ] `THROTTLE_TRUST_PROXY=true` if behind a reverse proxy
- [ ] `ENABLE_SWAGGER=false` if the API docs should not be public
- [ ] Secrets rotated
- [ ] CORS origins configured
- [ ] SSL certificates valid

### Monitoring

- [ ] Sentry DSN configured
- [ ] ⛔ **Alerting rules defined** — no alert rules exist in the repository
- [ ] Health check responding at `GET /api/v1/health`
- [ ] ⛔ **Log aggregation configured** — no aggregation stack is defined in the repository

### Missing artifact

- [ ] ⛔ **A `Dockerfile` exists.** It does not. `find . -name "Dockerfile*"` returns nothing, so
      every "Deploy to Railway" step below is blocked at step one.

---

## Frontend Deployment (Vercel)

### Setup

1. Connect GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy

### Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.hakawi.com/v1
NEXT_PUBLIC_SANITY_PROJECT_ID=your-project-id
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_APP_URL=https://hakawi.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

### Build Settings

- **Build Command:** `npm run build`
- **Output Directory:** `.next`
- **Install Command:** `npm install`

### Automatic Deployments

- **Production:** Deploys on `main` branch push
- **Preview:** Deploys on PR creation
- **Rollback:** Available in Vercel dashboard

---

## Backend Deployment (Railway)

### Setup

1. Connect GitHub repository to Railway
2. Add PostgreSQL and Valkey plugins
3. Configure environment variables
4. Deploy

### Environment Variables

```env
NODE_ENV=production
PORT=3001
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPOST}}
VALKEY_HOST=${{Valkey.HOST}}
VALKEY_PORT=${{Valkey.PORT}}
VALKEY_PASSWORD=${{Valkey.PASSWORD}}
JWT_SECRET=<≥32 chars, different from REFRESH_TOKEN_SECRET>
REFRESH_TOKEN_SECRET=<≥32 chars>
ENCRYPTION_KEY=<generated>
PAYMOB_ENVIRONMENT=live
PAYMOB_API_KEY=…
PAYMOB_MERCHANT_ID=…
PAYMOB_INTEGRATION_ID=…
PAYMOB_WEBHOOK_SECRET=…
SENTRY_DSN=…
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
CORS_ORIGIN=https://hakawi.com
FRONTEND_URL=https://hakawi.com
ENABLE_SWAGGER=false
THROTTLE_TRUST_PROXY=true
WAF_ENABLED=true
WAF_FAIL_MODE=closed
```

**Corrections to the previous list:**

| Removed | Why |
|---|---|
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD` | ⛔ Read by nothing. No SMTP client is wired. See `docs/deployment/environment.md` |
| `STORAGE_PROVIDER=r2` | ⛔ `STORAGE_PROVIDER` is **not read** by any config factory. R2 works through S3 compatibility, not a provider switch |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | ✅ still real — but they come from `STORAGE_*`, which is a real family; the *provider* value is not |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | ✅ still **accepted**, but only as an optional fallback in `config/valkey.config.ts` / `ValkeyService`. The Socket.IO adapter reads `valkey.*` through `ConfigService`, so these are **not required** |

**Added:** `ENCRYPTION_KEY`, `PAYMOB_ENVIRONMENT`, `PAYMOB_INTEGRATION_ID`, `SENTRY_ENVIRONMENT`,
`SENTRY_TRACES_SAMPLE_RATE`, `FRONTEND_URL`, `ENABLE_SWAGGER`, `THROTTLE_TRUST_PROXY`,
`WAF_ENABLED`, `WAF_FAIL_MODE`.

**Removed from the recommended set:** the `REDIS_*` trio. This document previously listed
`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` as required "for the Socket.IO adapter". **That was
wrong** — `redis-io.adapter.ts:29-31` reads `valkey.host` / `valkey.port` / `valkey.password`
through `ConfigService`, so `VALKEY_*` alone is sufficient. `REDIS_*` survives only as an
**optional** fallback accepted by `config/valkey.config.ts` and `ValkeyService` for operators
migrating from Redis. Keep the `VALKEY_*` lines above; the `REDIS_*` lines are dropped rather than
left as a second copy of the same three values.
`PAYMOB_WEBHOOK_SECRET` is retained above and is real, but it is read directly in
`backend/src/modules/payments/payments.service.ts:412` rather than through `paymob.config.ts`; if it is unset, every Paymob
webhook is rejected.

The complete authoritative list is `docs/deployment/environment.md`, which follows
`backend/.env.example`.

### Build Settings

- **Build Command:** `npm run build`
- **Start Command:** `npm run start:prod`
- **Port:** `$PORT` (Railway provides this)

### Scaling

- **Start:** 1 instance
- **Scale:** Add instances based on traffic
- **Auto-scaling:** Configure based on CPU/memory

---

## Database Migrations

Migrations are 22 numbered `.sql` files at the repository-root `migrations/` directory, applied by a
transaction-wrapped runner with a sha256 content-checksum ledger. Full detail:
`docs/data-architecture/migrations/migration-strategy.md`.

### Pre-Migration

```bash
# 1. Back up the database yourself — there is no automated backup
pg_dump -h localhost -U postgres hakawi > backup.sql

# 2. Lint the migration chain (static, no database required)
npm run db:check

# 3. Apply
npm run migration:run

# 4. Verify the ledger
npm run migration:verify
npm run migration:status
```

> `npm run db:verify` **does not exist** and never did. Use `npm run db:check` (static) or
> `npm run migration:verify` (against a live database).

### Migration Deployment

```bash
# 1. Deploy code first (backward compatible)
git push origin main

# 2. Apply migrations
npm run migration:run

# 3. Verify the application
curl https://api.hakawi.com/api/v1/health
```

> The health path is **`/api/v1/health`**, not `/health`. The global prefix `api/v1` is set at
> `backend/src/main.ts:65`.

### Rollback

```bash
# 1. Roll back the migration
npm run migration:rollback -- --steps 1

# 2. Or roll back to a named migration
npm run migration:rollback -- --to 0015

# If the down script is classified `data-loss`, you must opt in explicitly:
npm run migration:rollback -- --steps 1 --allow-data-loss

# 3. Deploy the previous code
git revert HEAD
git push origin main

# 4. Verify
curl https://api.hakawi.com/api/v1/health
```

> `npm run migration:revert` **does not exist.** The real command is `npm run migration:rollback`,
> and it did not exist before the migration system was rebuilt.
>
> ⚠️ A migration whose down script is `irreversible` **will not roll back under any flag.**
> ⛔ **But no migration in the chain is `irreversible`.** Measured across all 22 down scripts:
> **0 `irreversible`, 18 `data-loss`, 4 `reversible`**. This note previously named
> `0001_create_stories_tables` as "deliberately irreversible because it owns the shared `uuid-ossp`
> extension" — that was a misclassification; `migrations/down/0001_create_stories_tables.down.sql:1`
> is `reversibility=data-loss` and never drops the extension. A `data-loss` rollback **does** run, with
> `--allow-data-loss`. The `irreversible` branch still exists in the runner for a future migration that
> genuinely cannot be undone; nothing uses it today.
>
> ⚠️ `npm run migration:rollback` is a **`backend` workspace script only** — it is not in the root
> `package.json`. From the repo root use `npm run migration:rollback --workspace=backend -- --steps 1`.
> (`migration:run`, `migration:status`, `migration:verify` and `db:check` *are* in the root
> `package.json`.)

---

## Health Checks

### Backend Health Endpoint — ✅ real

`backend/src/app.controller.ts:62-73` (`@Get('health')`), with the global `api/v1` prefix set at
`main.ts:101`:

```typescript
@Get('health')
async getHealth() {
  const dbHealthy = await this.checkDatabase();      // SELECT 1
  const valkeyHealthy = await this.checkValkey();     // PING

  return {
    status: dbHealthy && valkeyHealthy ? 'healthy' : 'degraded',
    database: dbHealthy ? 'connected' : 'disconnected',
    valkey: valkeyHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  };
}
```

### Health Check Response

```json
{
  "status": "healthy",
  "database": "connected",
  "valkey": "connected",
  "timestamp": "2026-09-19T10:00:00.000Z"
}
```

**Full path: `GET /api/v1/health`.** The previous version of this document showed
`curl https://api.hakawi.com/health` and a `services: { database, valkey, sanity }` object with
`"ok"` values. There is no `services` wrapper, no `ok` value, and **no Sanity check** — only
PostgreSQL and Valkey. The status is `degraded`, not `unhealthy`, when a dependency is down, and the
endpoint always returns **200**; it does not return 503. A load balancer pointed at it must parse
the body, not trust the status code.

---

## Monitoring

### Sentry Configuration

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? process.env.GIT_COMMIT_SHA,
  tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
});
```

The real implementation lives in `backend/src/common/observability/sentry.config.ts`: it is a no-op
when `SENTRY_DSN` is unset, and `AllExceptionsFilter` forwards unhandled (non-`HttpException`)
errors to `Sentry.captureException`.

### Alerts

- **Error rate > 1%** — Alert immediately
- **Response time > 2s** — Alert
- **Database connection pool exhausted** — Alert
- **Disk space > 80%** — Alert

### Dashboards

- Error rate over time
- Response time percentiles (p50, p95, p99)
- Database query performance
- Cache hit rate
- Payment success rate

---

## SSL/TLS

### Frontend (Vercel)

- Automatically provisioned by Vercel
- Force HTTPS redirects

### Backend (Railway)

- Automatically provisioned by Railway
- Force HTTPS redirects in NestJS:

```typescript
app.enable('trust proxy');
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});
```

---

## CI/CD Pipeline

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm run lint
      - run: npm run test:cov

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: railway-app/action@v1
        with:
          railway-token: ${{ secrets.RAILWAY_TOKEN }}
          service: hakawi-backend

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## Rollback Strategy

### Frontend (Vercel)

- Go to Vercel dashboard
- Click "Deployments"
- Click "..." on previous deployment
- Click "Promote to Production"

### Backend (Railway)

- Go to Railway dashboard
- Click "Deployments"
- Click "Redeploy" on previous deployment
- Or use Railway CLI: `railway rollback`

### Database

- Never rollback migrations in production
- Instead, create new migration to fix issue
- If critical, restore from backup

---

## Performance Optimization

### Frontend

- Enable CDN caching (Vercel Edge Network)
- Optimize images (Next.js Image component)
- Code splitting (dynamic imports)
- Minify assets (automatic in production)

### Backend

- Enable compression (gzip/brotli)
- Database query optimization (indexes)
- Connection pooling
- Cache frequently accessed data

---

## Security

### HTTPS
- Force HTTPS everywhere — ⚠️ **the application does not do this.** There is no HTTPS redirect and
  no `trust proxy` configuration anywhere in `backend/src`. TLS must be terminated by the platform
  or a reverse proxy, and the proxy must forward `X-Forwarded-For` **and** have
  `THROTTLE_TRUST_PROXY=true` set, or per-IP throttling and WAF IP blocking will key on the proxy's
  address instead of the client's.
- HSTS — ✅ set, but **only when `NODE_ENV === 'production'`** (`backend/src/main.ts:26-28`)
- TLS 1.3 only — a platform concern

### Headers — ⚠️ `helmet` is NOT used

The previous version of this document prescribed `app.use(helmet({...}))`. **There is no `helmet`
dependency in `backend/package.json`** and no such call in the code.

The real implementation is a hand-written map in `backend/src/main.ts:15-21`:

```ts
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};
```

`Strict-Transport-Security: max-age=31536000; includeSubDomains` is added separately, and only in
production.

⛔ **No `Content-Security-Policy` is set.** The previous `contentSecurityPolicy` directives block
describes a policy that has never existed. If CSP is required, it has to be written and added to
that map.

### Secrets
- Never log secrets
- Rotate secrets regularly
- Use different secrets per environment
- ⚠️ Rotating `JWT_SECRET` or `REFRESH_TOKEN_SECRET` invalidates every outstanding token for that
  pair. Safe, but user-visible.

---

## Maintenance

### Regular Tasks

- **Weekly:** Review error logs in Sentry
- **Monthly:** Update dependencies
- **Quarterly:** Security audit
- **Bi-annually:** Disaster recovery drill

### Updates

```bash
# Update dependencies
npm audit fix
npm update

# Test updates
npm test
npm run test:e2e

# Deploy
git push origin main
```

---

*This document defines the deployment process for Hakawi.*
