# Environment Variables & Configuration
## Hakawi - Configuration Management

**`backend/.env.example` is the source of this document.** Every variable listed below was checked
against `backend/.env.example` **and** against the code that reads it
(`grep -rho "process\.env\.[A-Z_0-9]*" --include='*.ts' backend/src/`, excluding specs).

Status markers: ✅ read by the code · ⛔ read by nothing.

---

## Environment Files

### Backend — ✅ as documented
```
backend/
├── .env.example          # the source of truth for the variable list
├── .env.development
├── .env.staging
├── .env.production       # never commit
└── .env.test
```

### Frontend
```
frontend/
├── .env.local            # local overrides (never commit)
├── .env.development
├── .env.staging
└── .env.production
```

---

## Backend Environment Variables

### Database — ✅ real
`backend/src/config/database.config.ts`

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hakawi
DB_USER=postgres
DB_PASSWORD=changeme
```

⛔ **Removed from this document, because no code reads them:**
`DB_SSL`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT`. Connection-pool sizing is **not**
configurable.

### Valkey — ✅ real
`backend/src/config/valkey.config.ts`

```env
VALKEY_HOST=localhost
VALKEY_PORT=6379
VALKEY_PASSWORD=
```

⛔ **Removed, read by nothing:** `VALKEY_DB`, `VALKEY_TTL_SESSION`, `VALKEY_TTL_RATE_LIMIT`,
`VALKEY_TTL_WAF`. TTLs are set per call, not by a global policy variable.

> **Corrected.** The adapter `backend/src/redis-io.adapter.ts:29-31` reads **`valkey.host` /
> `valkey.port` / `valkey.password`** through `ConfigService` — the same `VALKEY_*`-first
> resolution the cache uses. This document previously said it read `REDIS_HOST` / `REDIS_PORT` /
> `REDIS_PASSWORD` "because it configures `@socket.io/redis-adapter`", which was **wrong**: the
> adapter is the one component that used a different variable family, which meant a Docker Compose
> deployment pointed websocket fan-out at `localhost:6379` while the cache connected correctly —
> invisible on one instance, silent fan-out loss on several. That is fixed
> (`docs/adr/005-security-and-correctness-hardening.md`).
> `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` remain **optional fallback names** accepted by
> `config/valkey.config.ts` and `common/services/valkey.service.ts`, for operators migrating from
> Redis. You do **not** need both families set.
> ⚠️ `backend/.env.example:24-30` still documents the old behaviour and is stale; it is outside
> this document set and is reported rather than edited.

### JWT — ✅ real
`backend/src/config/jwt.config.ts`; both secrets are zod-validated to a **minimum of 32
characters**.

```env
JWT_SECRET=your-jwt-secret-key-here-change-in-production
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=your-refresh-token-secret-here-change-in-production
REFRESH_TOKEN_EXPIRY=7d
ENCRYPTION_KEY=your-encryption-key-here-change-in-production
```

`ENCRYPTION_KEY` is read by `backend/src/common/utils/encryption.util.ts:16` and the app **refuses
to start** without it when it is needed.

### OAuth Providers — ⚠️ read this section

```env
# Google
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/oauth/google/callback

# Apple
APPLE_CLIENT_ID=…
APPLE_CLIENT_SECRET=…
APPLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/oauth/apple/callback

# Facebook  ⚠️ names differ from .env.example
FACEBOOK_APP_ID=…
FACEBOOK_APP_SECRET=…
FACEBOOK_CALLBACK_URL=http://localhost:3001/api/v1/auth/oauth/facebook/callback

# GitHub
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
GITHUB_CALLBACK_URL=http://localhost:3001/api/v1/auth/oauth/github/callback

# TikTok  ⚠️ key names differ from .env.example
TIKTOK_CLIENT_KEY=…
TIKTOK_CLIENT_SECRET=…
TIKTOK_CALLBACK_URL=http://localhost:3001/api/v1/auth/oauth/tiktok/callback

# Redirect target after the OAuth dance
FRONTEND_URL=http://localhost:3000
```

**Two concrete defects, in `backend/.env.example` and not in the code:**

| `.env.example` says | The code actually reads | Consequence |
|---|---|---|
| `FACEBOOK_CLIENT_ID` | `FACEBOOK_APP_ID` (`auth.service.ts:136,235`) | Facebook login sends an empty `client_id` |
| `FACEBOOK_CLIENT_SECRET` | `FACEBOOK_APP_SECRET` (`backend/src/modules/auth/auth.service.ts:236`) | Facebook login fails |
| `TIKTOK_CLIENT_ID` | `TIKTOK_CLIENT_KEY` (`auth.service.ts:169,332`) | TikTok login sends an empty `client_key` |

The code is right; `.env.example` is wrong. **This document follows the code.** Fixing
`.env.example` is a source change and is outside the documentation scope.

**The 5 `*_CALLBACK_URL` variables and `FRONTEND_URL` were entirely undocumented before this
reconciliation.** Each has a working default baked into `auth.service.ts` /
`auth.controller.ts`, so omitting them does not break a local run — but a production deployment
with real OAuth providers behind a proxy will not work without them.

⛔ **Removed, read by nothing:** `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`.

### Payments (Paymob) — ✅ all real
`backend/src/config/paymob.config.ts`

```env
PAYMOB_ENVIRONMENT=sandbox              # sandbox | live — selects the CREDENTIAL SET
PAYMOB_API_KEY=…
PAYMOB_MERCHANT_ID=…
PAYMOB_INTEGRATION_ID=…
PAYMOB_SANDBOX_API_KEY=                 # used only when PAYMOB_ENVIRONMENT=sandbox
PAYMOB_SANDBOX_INTEGRATION_ID=          # used only when PAYMOB_ENVIRONMENT=sandbox
PAYMOB_BASE_URL=https://accept.paymob.com/api
PAYMOB_REQUEST_TIMEOUT_MS=10000
PAYMOB_AUTH_TIMEOUT_MS=8000
PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS=3000
PAYMOB_RETRY_MAX_ATTEMPTS=2
PAYMOB_WEBHOOK_SECRET=…                    # read directly in payments.service.ts, not by paymob.config.ts
```

> `PAYMOB_WEBHOOK_SECRET` is the one Paymob variable **not** covered by `paymob.config.ts`. It is
> read straight from `process.env` in `backend/src/modules/payments/payments.service.ts:412`. If it is unset, every webhook is
> rejected with `Webhook secret is not configured` — the endpoint fails closed, which is the right
> default, but it means a deploy that forgets this variable silently accepts no payments.

> **The base URL does not vary by mode.** `PAYMOB_SANDBOX_BASE_URL` and `PAYMOB_LIVE_BASE_URL` are
> both `https://accept.paymob.com/api` (`backend/src/config/paymob.config.ts:5-6`). What changes between sandbox and
> live is the **API key and integration id**. The previous version of this document implied the URL
> differs; it does not. `PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS` is clamped below Paymob's 3600s auth
> token lifetime.

### Rate Limiting — ✅ all real
`backend/src/config/throttle.config.ts`. **The entire `THROTTLE_*` family was undocumented before
this reconciliation.**

```env
THROTTLE_DEFAULT_TTL=60000
THROTTLE_DEFAULT_LIMIT=100        # per user
THROTTLE_AUTH_TTL=60000
THROTTLE_AUTH_LIMIT=10            # per IP
THROTTLE_UPLOAD_TTL=60000
THROTTLE_UPLOAD_LIMIT=5           # per user
THROTTLE_SEARCH_TTL=60000
THROTTLE_SEARCH_LIMIT=50          # per user
THROTTLE_BLOCK_DURATION=0
THROTTLE_TRUST_PROXY=false
# Escape hatch: if either is set it replaces the limit/window of EVERY tier.
# Leave both UNSET in production.
# THROTTLE_TTL=
# THROTTLE_LIMIT=
```

### WAF — ✅ all real
`backend/src/config/waf.config.ts`. Complete and authoritative:

```env
WAF_ENABLED=true
WAF_LOG_VIOLATIONS=true
WAF_BLOCK_ON_VIOLATION=true
WAF_FAIL_MODE=open                      # open | closed
WAF_BLOCK_SEVERITY=high                 # low | medium | high | critical
WAF_DISABLED_RULES=                     # CSV of rule ids from src/common/waf/rules.ts
WAF_MAX_REQUEST_SIZE=10485760           # 10MB
WAF_ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD
WAF_TEMP_BLOCK_SECONDS=3600
WAF_VIOLATION_WINDOW_SECONDS=900
WAF_VIOLATIONS_BEFORE_TEMP_BLOCK=5
WAF_VIOLATIONS_BEFORE_PERMANENT_BLOCK=25
WAF_BLOCKED_COUNTRIES=                   # reserved: geo-blocking is NOT implemented
```

⛔ **Removed, read by nothing:** `WAF_RATE_LIMIT_ENABLED`, `WAF_RATE_LIMIT_REQUESTS`,
`WAF_RATE_LIMIT_WINDOW` (these were never in the config at all), plus `WAF_ADMIN_EMAIL`,
`WAF_STRICT_REFERRER`, `WAF_FINGERPRINT_PROTECTION` — the last three are in
`backend/.env.example` but no code reads them.

### Resilience — ✅ all real
`backend/src/common/resilience/{circuit-breaker,retry,timeout}.service.ts`. **Entirely
undocumented before this reconciliation.**

```env
RETRY_MAX_RETRIES=3
RETRY_INITIAL_DELAY_MS=1000
RETRY_MAX_DELAY_MS=10000
RETRY_BACKOFF_MULTIPLIER=2
RETRY_JITTER_MS=500

CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS=30000
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
CIRCUIT_BREAKER_MONITORING_PERIOD_MS=60000

DEFAULT_OPERATION_TIMEOUT_MS=
```

### Sanity CMS — ✅ real
```env
SANITY_PROJECT_ID=…
SANITY_DATASET=production
SANITY_API_VERSION=2024-01-01
SANITY_TOKEN=…
```

### Storage — ✅ real
```env
STORAGE_PROVIDER=s3
STORAGE_BUCKET=hakawi-media
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=…
STORAGE_SECRET_KEY=…
STORAGE_CDN_URL=
```

⛔ **Removed, read by nothing:** `STORAGE_ENDPOINT`. (R2 works because it is S3-compatible and the
SDK is pointed at R3 by DNS, not by a custom endpoint variable.)

### Sentry — ✅ real
```env
SENTRY_DSN=…                             # unset ⇒ the integration is a no-op
SENTRY_ENVIRONMENT=development           # development | staging | production
SENTRY_TRACES_SAMPLE_RATE=1.0
SENTRY_RELEASE=                          # release tag or commit SHA
```

### Application — ✅ real
```env
NODE_ENV=development                     # development | production | test (app.config.ts zod-enum)
PORT=3001
CORS_ORIGIN=http://localhost:3000
ENABLE_SWAGGER=true                      # anything other than "false" enables /api/docs
```

⛔ **Removed, read by nothing:** `API_PREFIX` — the global prefix `api/v1` is hard-coded at
`backend/src/main.ts:65`.
⛔ **Removed, read by nothing:** `RUN_MIGRATIONS` — migrations are applied by an explicit command,
never on boot.

### Email — ⚠️ almost entirely fiction
```env
EMAIL_FROM=noreply@hakawi.com            # the ONLY email variable any code reads
```

`EMAIL_FROM` is read at `backend/src/modules/notifications/email/notifications-email.service.ts:21`.

⛔ **Read by nothing:** `EMAIL_PROVIDER`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`,
`EMAIL_PASSWORD`, `EMAIL_REPLY_TO`. **No SMTP client is wired.** The notification module emits
events; nothing sends mail. The password-reset flow will create a token and emit
`password.reset.requested`, and no email will ever be delivered.

### Cache — ⛔ the entire block is fiction
```env
# CACHE_ENABLED, CACHE_TTL_DEFAULT, CACHE_TTL_USER, CACHE_TTL_STORY, CACHE_TTL_NOTIFICATION
```

`grep -rl "CACHE_" --include='*.ts' backend/src` matches only the `@Cacheable` decorator's own
metadata constants. **No code reads any `CACHE_*` variable.** Cache TTLs are exported constants in
each service: `STORY_CACHE_TTL_SECONDS = 600`, `BOOK_CACHE_TTL_SECONDS = 600`,
`PAYMENT_CACHE_TTL_SECONDS = 300`, and `DEFAULT_CACHE_TTL_SECONDS = 3600` in the decorator. They are
compile-time constants, not configuration. `backend/.env.example` lists these five variables; they
have no effect.

---

## Frontend Environment Variables

### API — ✅ real
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### App
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> ⚠️ `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_VERSION`,
> `NEXT_PUBLIC_SANITY_*`, `NEXT_PUBLIC_ANALYTICS_ID` and `NEXT_PUBLIC_SENTRY_DSN` were documented
> here before. **No frontend code reads them**, and the frontend has no `.env.example`. The only
> frontend variable the application actually uses is `NEXT_PUBLIC_API_URL`
> (`frontend/src/lib/api.ts:47`, defaulting to `http://localhost:3001/api/v1`).

---

## Configuration Management

### NestJS Config — ✅ real, and zod-validated

There is no `backend/src/config/configuration.ts`. Configuration is split into six
`registerAs()` factories, each with its own zod schema that fails fast at boot:

| File | Namespace | Validates |
|---|---|---|
| `config/app.config.ts` | `app` | `NODE_ENV`, `PORT`, `CORS_ORIGIN` |
| `config/database.config.ts` | `database` | `DB_*` |
| `config/valkey.config.ts` | `valkey` | `VALKEY_*` |
| `config/jwt.config.ts` | `jwt` | `JWT_SECRET` (min 32), `JWT_EXPIRY`, `REFRESH_TOKEN_SECRET` (min 32), `REFRESH_TOKEN_EXPIRY` |
| `config/paymob.config.ts` | `paymob` | the whole `PAYMOB_*` set |
| `config/throttle.config.ts` | `throttle` | the whole `THROTTLE_*` set |
| `config/waf.config.ts` | `waf` | the whole `WAF_*` set |

A single `envSchema.parse(process.env)` at the top of each file means a malformed value is a startup
crash, not a runtime surprise. This is the "Use `zod` to validate environment variables" section
this document previously described as advice — it is the implementation.

### Next.js Config
`frontend/next.config.ts` is a 5-line file:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@hakawi/shared-types"],
};

export default nextConfig;
```

There is no `env` block, no image config, and no remote patterns. `transpilePackages` points at the
**compiled** shared-types package; the previous `paths` alias made Turbopack bundle the source tree
with NodeNext `.js` specifiers it cannot resolve.

---

## Secret Management

### Development
- Use `.env` files (never commit) — `backend/.gitignore` and `frontend/.gitignore` exclude them
- ⚠️ `ENCRYPTION_KEY` in `backend/.env.example` is a placeholder string, not a valid key. Generate
  one for any environment that stores real data.

### Production
- Use environment variables in the deployment platform
- Use a secret manager (AWS Secrets Manager, HashiCorp Vault)
- Never commit secrets to git

### Rotation
- Rotate secrets regularly
- Use different secrets per environment
- ⚠️ Rotating `REFRESH_TOKEN_SECRET` invalidates every outstanding refresh token (they will not
  verify). Rotating `JWT_SECRET` invalidates every access token. Both are safe but user-visible.

---

## Configuration Checklist

### Backend
- [ ] Database credentials configured
- [ ] Valkey configured
- [ ] JWT secrets set (min 32 chars) and **different from each other**
- [ ] `ENCRYPTION_KEY` generated (not the placeholder)
- [ ] OAuth providers configured — ⚠️ using the **code's** variable names (`FACEBOOK_APP_ID`,
      `TIKTOK_CLIENT_KEY`), not the ones in `.env.example`
- [ ] All 5 `*_CALLBACK_URL` values and `FRONTEND_URL` set
- [ ] Paymob credentials configured, with `PAYMOB_ENVIRONMENT` matching the credential set
- [ ] `THROTTLE_TRUST_PROXY` set **true** when deployed behind a reverse proxy — otherwise per-IP
      throttling and IP blocking key on the proxy's address
- [ ] `THROTTLE_LIMIT` / `THROTTLE_TTL` left **unset**
- [ ] Sentry DSN configured
- [ ] `CORS_ORIGIN` set to the real frontend origin
- [ ] `ENABLE_SWAGGER=false` in production if the API docs should not be public
- [ ] WAF rules reviewed; `WAF_FAIL_MODE` chosen deliberately

### Frontend
- [ ] `NEXT_PUBLIC_API_URL` configured

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| `DB_SSL`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT` | ⛔ Read by nothing. Removed |
| `VALKEY_DB`, `VALKEY_TTL_SESSION`, `VALKEY_TTL_RATE_LIMIT`, `VALKEY_TTL_WAF` | ⛔ Read by nothing. Removed |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | ⛔ Read by nothing. Removed |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Code reads `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`. **`backend/.env.example` has the same defect** |
| `TIKTOK_CLIENT_ID` | Code reads `TIKTOK_CLIENT_KEY`. Same `.env.example` defect |
| `STORAGE_ENDPOINT` | ⛔ Read by nothing. Removed |
| `API_PREFIX` | ⛔ Read by nothing; `api/v1` is hard-coded. Removed |
| `EMAIL_PROVIDER`/`_HOST`/`_PORT`/`_USER`/`_PASSWORD`/`_REPLY_TO` | ⛔ Read by nothing; no SMTP client is wired. Only `EMAIL_FROM` is real |
| `CACHE_ENABLED` + the four `CACHE_TTL_*` | ⛔ Read by nothing — TTLs are compile-time constants. Removed. `.env.example` still lists them |
| `WAF_RATE_LIMIT_*` (3 vars) | ⛔ Never existed; rate limiting is the `THROTTLE_*` tiers |
| `WAF_ADMIN_EMAIL`, `WAF_STRICT_REFERRER`, `WAF_FINGERPRINT_PROTECTION` | ⛔ Read by nothing, though listed in `.env.example`. Removed |
| — | **Added:** `THROTTLE_TTL`, `THROTTLE_LIMIT`, and all 13 other `THROTTLE_*` variables |
| — | **Added:** `ENABLE_SWAGGER` |
| — | **Added:** `FRONTEND_URL` and all 5 `*_CALLBACK_URL` |
| — | **Added:** the entire `PAYMOB_*` set, including `PAYMOB_ENVIRONMENT`, the sandbox credential
      overrides, both timeouts, the auth-token cache TTL, and the retry attempt count |
| — | **Added:** all 5 `CIRCUIT_BREAKER_*` and all 5 `RETRY_*` variables, plus `DEFAULT_OPERATION_TIMEOUT_MS` |
| — | **Corrected:** sandbox vs live is selected by the **credential set**, not the base URL; both modes use `https://accept.paymob.com/api` |
| — | **Corrected:** `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` are **optional fallback names** for `config/valkey.config.ts` and `ValkeyService`, not a Socket.IO-adapter requirement. The adapter reads `valkey.*` via `ConfigService` (`redis-io.adapter.ts:29-31`) |
| `backend/src/config/configuration.ts` as a single config factory | ⛔ Does not exist. **7** `registerAs()` factories, each zod-validated: `app`, `database`, `jwt`, `paymob`, `throttle`, `valkey`, `waf`. (`encryption.config.ts` deliberately does **not** register one — its reason is written in the file) |
| `frontend/next.config.js` with an `env` block | ⛔ No `env` block, and the file is `next.config.ts` not `.js`. It is not empty — it sets exactly one thing, `transpilePackages: ["@hakawi/shared-types"]` |
| Frontend `NEXT_PUBLIC_SANITY_*`, `NEXT_PUBLIC_ANALYTICS_ID`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_ENV/NAME/VERSION` | ⛔ Read by nothing. Only `NEXT_PUBLIC_API_URL` is real |

**Variable count.** This document previously asserted "**67** distinct variables are read by the
backend". ⛔ **That number is not reproducible and has been withdrawn.** It depends entirely on how you
count — a direct `process.env.X` reference is not the same thing as a key in a `zod` schema, and a
variable read in only one branch counts the same as one read everywhere. Measured on 2026-10-04:
**58** direct `process.env.NAME` references in non-spec backend sources, **61** uppercase keys
declared across `backend/src/config/*.ts` zod schemas, and a union of the two that includes
aliases and derived names. Rather than print a third plausible-looking number, the count is recorded
as **unknown**. The authoritative inventory is `.env.example` and the config factories themselves,
which are enumerated above variable by variable.

---

*This document defines the environment configuration for Hakawi.*
