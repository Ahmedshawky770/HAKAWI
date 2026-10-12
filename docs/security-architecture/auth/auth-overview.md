# Authentication Architecture
## Hakawi Security Architecture

This document defines the authentication architecture for Hakawi, including session management, token lifecycle, MFA, and OAuth provider integration.

---

## Authentication Flow

### High-Level Flow
```
1. User initiates authentication (login/register)
2. Frontend redirects to OAuth provider OR accepts credentials
3. OAuth provider redirects back with authorization code
4. Backend exchanges code for access token
5. Backend creates/updates user record
6. Backend creates session (JWT + refresh token)
7. Frontend stores tokens securely
8. Frontend includes access token in API requests
9. Backend validates access token on each request
10. Frontend refreshes access token when expired
```

---

## Session Management

### Token Types

#### Access Token
- **Type:** JWT
- **Expiry:** 15 minutes (`JWT_EXPIRY`)
- **Storage:** HTTP-only cookie **and** `Authorization: Bearer` header
- **Payload:** `sub`, `email`, `accountType`, `adminRole?`, `iat`, `exp`
- **Algorithm:** HS256, signed with `JWT_SECRET` (min 32 chars)
- **Source:** `backend/src/common/utils/jwt.util.ts:22`

#### Refresh Token
- **Type:** **JWT**, not an opaque random string. Same claims as the access token plus `type: 'refresh'`, signed with a *different* secret (`REFRESH_TOKEN_SECRET`)
- **Expiry:** 7 days (`REFRESH_TOKEN_EXPIRY`)
- **Storage:** HTTP-only cookie
- **Rotation:** Yes — `refreshTokens()` blacklists the presented token before returning a new pair
- **Revocation store:** Valkey key `refresh_token:blacklist:<token>` with a 7-day TTL
- **Source:** `backend/src/common/utils/jwt.util.ts:30`, `backend/src/modules/auth/auth.service.ts:49,549-640`

> The two tokens use **different signing secrets**, so an access token can never be replayed as a refresh token and vice versa.

### Token Lifecycle

```
1. User logs in
2. Backend creates access token (15m) + refresh token (7d), both signed JWTs
3. Backend sets both as httpOnly cookies; the access token is ALSO returned in the body
4. Frontend includes access token in Authorization header
5. Backend validates access token (JwtAuthGuard reads the header first, then the cookie)
6. When access token expires:
   - Frontend calls POST /api/v1/auth/refresh
   - Backend verifies the refresh token signature AND checks the blacklist
   - Backend creates a new access token + a new refresh token
   - The presented refresh token is blacklisted in Valkey
   - New tokens returned
   - Presenting a blacklisted token is rejected as "Refresh token has been revoked"
7. When refresh token expires (or is blacklisted):
   - User must login again
```

### Token Storage

#### Frontend
- Access token: HTTP-only cookie set by the server; the frontend API layer also keeps the value returned in the response body in memory
- Refresh token: HTTP-only cookie (cannot be read by JavaScript)

#### Backend
- **No server-side session record.** There is no session table, no session key in Valkey, and no device/IP/user-agent capture. A token is valid if it verifies and (for refresh) is not blacklisted.
- The only server-side token state is the refresh-token blacklist.

---

## OAuth Providers

### Supported Providers
- Google
- Apple
- Facebook
- GitHub
- TikTok

### Provider Configuration
```typescript
const providers = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile'
  },
  // ... other providers
};
```

### OAuth Flow
1. Frontend redirects to provider authorization URL
2. User authenticates with provider
3. Provider redirects back with authorization code
4. Backend exchanges code for access token
5. Backend fetches user profile from provider
6. Backend creates/updates user account
7. Backend creates session
8. Frontend receives session tokens

---

## MFA (Multi-Factor Authentication) — ✅ IMPLEMENTED, ⚠️ NOT ENFORCED

**Status: built, optional per user. Enrolment, verification and removal are all live; nothing is
gated on a second factor.**

A `grep -rniE "mfa|totp|two.factor|2fa"` across `backend/src` returns **15 files / 255 lines**
(`frontend/src` and `packages/` return zero). What exists:

| Piece | Where |
|---|---|
| 6 routes | `backend/src/modules/auth/mfa.controller.ts` — `@Controller('auth/mfa')`, `@UseGuards(JwtAuthGuard)`, `@ThrottleTier('auth')`, registered in `auth.module.ts:16` |
| TOTP engine | `backend/src/modules/auth/mfa.service.ts` — `speakeasy` (RFC 6238) + `qrcode` |
| Guard + decorator | `backend/src/common/guards/mfa.guard.ts`, `@RequireMfa()` at `backend/src/common/decorators/roles.decorator.ts:24` |
| Storage | `backend/src/db/schema/users.schema.ts:31-33` — `totp_secret_encrypted`, `mfa_enabled` (default `false`), `mfa_enforced_at` |
| Migration | `migrations/0029_add_mfa_support.sql` |
| Tests | `mfa.controller.spec.ts`, `mfa.service.spec.ts` |

**What is still false about MFA, stated precisely:**

- ❌ **No route enforces it.** `@RequireMfa()` has **no call site** and `MfaGuard` appears in no
  module's `providers` and no `@UseGuards`, so no request is ever gated on a second factor.
- ❌ **No `mfa_required` branch in the login flow.** `POST /api/v1/auth/login` returns tokens
  directly; the second factor is verified separately at `POST /api/v1/auth/mfa/challenge`.
- ❌ **The `MFA_REQUIRED` code never reaches a client.** `MfaGuard` sets `code` on the exception
  body, but `AllExceptionsFilter` copies only the `error` field onto the response.
- ❌ **Admin enforcement is coded but unreachable.** `shouldEnforceMfa()` returns `true` for any user
  with an `adminRole`, and `MfaGuard` would block such an account until `X-MFA-Token` verifies —
  but since the guard is mounted nowhere, an admin account is still exactly as strong as its
  password.

The subsections below describe what is implemented, and call out where the original design intent
was not carried out.

### TOTP-based MFA — ✅ implemented
- **Algorithm:** TOTP (RFC 6238), `speakeasy` (`backend/package.json`)
- **Issuer:** Hakawi (`TOTP_ISSUER`, `mfa.service.ts`)
- **Digits:** 6 · **Period:** 30 seconds · **Verification window:** ±1 step (±30 s clock drift)
- **Secret:** base32, 160-bit, generated by `initiateSetup()`
- **During setup:** the secret and backup codes are held in Valkey under `mfa:totp:<userId>` for 10
  minutes until the first code is confirmed
- **Once confirmed:** the secret is AES-256-GCM encrypted by `EncryptionService` and written to
  `users.totp_secret_encrypted`, and `mfa_enabled` is set — `migrations/0029_add_mfa_support.sql`
- **Source:** `backend/src/modules/auth/mfa.service.ts`

### Recovery Codes — ⚠️ implemented, with deviations from the design intent
- **Count:** 8 codes (`BACKUP_CODES_COUNT`, `mfa.service.ts:19`) — not 10
- **Format:** 8 uppercase hex characters — not "alphanumeric, hyphen-separated"
- **Storage:** each code AES-256-GCM encrypted and stored in Valkey under
  `mfa:backup_codes:<userId>` with a 1-year TTL — **not** in the database, so a Valkey flush loses them
- **Usage:** one-time use; a consumed code is spliced out of the stored list
- **Regeneration:** `POST /api/v1/auth/mfa/backup-codes` invalidates the previous set

### MFA Flow — ✅ steps 1-5 implemented, ❌ step 6 not built
1. ✅ `POST /api/v1/auth/mfa/setup` — `initiateSetup()` generates the TOTP secret and 8 backup codes
2. ✅ The response carries `secret`, `otpauthUrl`, `qrCodeDataUrl` and `backupCodes`
3. ✅ User scans the QR code with any RFC 6238 authenticator app
4. ✅ `POST /api/v1/auth/mfa/verify` — `completeSetup()` checks the first code (window ±1 step)
5. ✅ The secret is encrypted and stored; `mfa_enabled` becomes `true`; `mfa.enabled` is emitted
6. ❌ **On login there is no MFA step.** `POST /api/v1/auth/login` returns tokens directly. Step-up
   verification is a separate authenticated call: `POST /api/v1/auth/mfa/challenge`, which accepts a
   TOTP code or a backup code and returns `{ verified, backupCodeUsed }`

### MFA Enforcement — ⚠️ half-built, and live nowhere
- ✅ **Optional per user:** `POST /api/v1/auth/mfa/setup` and `DELETE /api/v1/auth/mfa` are self-service
- ⚠️ **Admin enforcement, code only:** `shouldEnforceMfa()` returns `true` for any user whose
  `adminRole` is set (`mfa.service.ts:268`), and `MfaGuard` checks it — but the guard is mounted on
  no route, so nothing is actually enforced
- ❌ **Super admin always required:** not implemented
- ❌ **Per-route opt-in:** `@RequireMfa()` exists (`decorators/roles.decorator.ts:24`) with **zero
  call sites**; `MfaGuard` also expects an `X-MFA-Token` header that no endpoint issues today

### What exists instead

MFA can be enrolled by any user, including admins, but nothing requires it. Account types include
`admin`, `shouldEnforceMfa()` treats every account with an `adminRole` as an account that *should*
be enforced, and `MfaGuard` would block such an account until `X-MFA-Token` verifies — but the
guard is wired to no route, so in practice `POST /api/v1/auth/login` returns tokens to an admin
exactly as it does to any other user. Because `adminRole` is carried in the token and checked by the
guards (`backend/src/common/guards/roles.guard.ts`), an administrator account is still protected by
*authorization* alone. The gap is no longer "no MFA in the repo"; it is "MFA exists and is enforced
nowhere".

---

## Password Authentication

### Hashing
- **Algorithm:** bcrypt
- **Rounds:** 12 (`backend/src/common/utils/password.util.ts:7`)
- **Salt:** Auto-generated by bcrypt

### Password Policy
Enforced by `class-validator` on `RegisterDto` and `ResetPasswordDto`
(`backend/src/modules/auth/dto/`), and by the global `ValidationPipe`:
- **Minimum length:** 8 characters
- **Maximum length:** 255 characters (the doc previously said 128)
- **Requirements:**
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character from `@$!%*?&`

### Password Reset
1. User requests password reset (`POST /api/v1/auth/forgot-password`)
2. System generates a reset token with `crypto.randomUUID()`, AES-encrypted onto the user row,
   and also stores `password:reset:<token>` → `userId` in Valkey for 1 hour
3. System emits `password.reset.requested` (the notification module sends the email)
4. User clicks reset link
5. User enters new password (`POST /api/v1/auth/reset-password`)
6. System validates the Valkey reset entry
7. System updates the bcrypt password hash
8. ✅ **System invalidates all sessions on password reset.** `auth.service.ts` writes
   `refresh_token:blacklist:user:<userId>` → `revoked` with the refresh-token TTL (`:919-921`) and the
   refresh path refuses every token for that user (`:689`) with
   `"Session has been revoked. Please log in again."`. ⚠️ The check is on the *refresh* path only —
   access tokens minted before the reset stay valid until they expire.

---

## Session Security

There is no server-side session. "Session" below means the pair of signed JWTs the client holds.

### Session Creation
- **IP address:** not captured
- **User Agent:** not captured
- **Device info:** not captured
- **Location:** not captured

### Session Validation
- ✅ Token signature verification (`JwtHelper.verifyRefreshToken` / `verifyAccessToken`)
- ✅ Expiration check (enforced by the JWT library from `exp`)
- ✅ Revocation check for refresh tokens only (Valkey blacklist lookup)
- ❌ IP address consistency — not implemented
- ❌ User agent consistency — not implemented

### Session Revocation
- **Single session:** ✅ `logout()` blacklists the presented refresh token
- **All sessions:** ❌ not implemented — there is no per-user index of live refresh tokens, so one
  user's tokens cannot be revoked in bulk
- **Admin action:** ❌ not implemented

### Session Limits
- ❌ **Max concurrent sessions: 5 per user — NOT IMPLEMENTED.** A user can hold unlimited
  concurrently valid refresh tokens; each one is independent and only its own blacklist key is set.
- ❌ **Session cleanup: NOT IMPLEMENTED.** Blacklist keys simply expire after their 7-day TTL.

---

## Security Measures

### Token Security
- ✅ Signed with HS256; `JWT_SECRET` and `REFRESH_TOKEN_SECRET` are separate secrets, each zod-validated to be at least 32 characters (`backend/src/config/jwt.config.ts:8,15`)
- ✅ Short access-token expiry (15 minutes)
- ✅ Refresh-token rotation with reuse detection
- ⚠️ Secure transmission (HTTPS only) is a **deployment** responsibility — the app itself sets no
  HTTPS redirect and calls no `trust proxy`

### Cookie Security

All four `res.cookie` / `res.clearCookie` calls share one constants module,
`backend/src/common/constants/auth-cookie.constants.ts`:

```ts
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge,          // 15m for access, 7d for refresh
  path: '/',
}
```

- ✅ HTTP-only flag
- ✅ Secure flag (HTTPS only, production only)
- ✅ SameSite: **Strict** (was previously `lax`; the code was wrong and is now correct)
- ✅ Path: `/`
- ❌ Domain: **not configurable** — the cookies are host-only, no `Domain` attribute is emitted
- ✅ Cookies are parsed by a hand-written `parseCookieHeader()` (`backend/src/common/constants/auth-cookie.constants.ts:24`).
  `cookie-parser` was **never registered** as middleware, so the hand-written parser is what makes
  cookie auth work at all; it is read by `JwtAuthGuard` (`backend/src/common/guards/jwt-auth.guard.ts:47`) and by the auth
  controller for the refresh and logout routes.

### Brute Force Protection

- ✅ **Rate limiting on login endpoints** — the `auth` throttle tier: 10 requests / 1 minute / per
  IP, enforced by `@ThrottleTier('auth')` over `ValkeyThrottlerStorage`
  (`backend/src/config/throttle.config.ts:32`). Real 429 tests exist.
- ❌ **Account lockout after 5 failed attempts — NOT IMPLEMENTED.** `auth.service.ts` keeps no
  attempt counter; a correct password works on the 100th try.
- ❌ **Progressive delay after failed attempts — NOT IMPLEMENTED.**
- ❌ **CAPTCHA after repeated failures — NOT IMPLEMENTED.** There is no CAPTCHA dependency in
  either `package.json`.

The only brake on credential stuffing is the per-IP rate limit, and it is a brake on the *IP*, not
on the account. See `docs/roadmap/phases/implementation-roadmap.md` — this is an open roadmap item.

---

## Error Handling

### Authentication Error Codes — ⛔ NOT IMPLEMENTED

**No authentication-specific machine-readable error codes exist.** A grep for
`error: '[A-Z_]+'` across `backend/src` returns zero hits outside the filter itself. The global
filter (`backend/src/common/filters/all-exceptions.filter.ts:20`) sets `errorCode` to the literal
`'INTERNAL_ERROR'` and only overrides it from `exceptionResponse.error` — and no exception in the
codebase sets that field. In practice the `error` field carries Nest's default reason phrase
(`"Unauthorized"`, `"Bad Request"`, …), not a stable code.

| Documented code | Real status |
|---|---|
| `INVALID_CREDENTIALS` | ❌ not implemented — login throws a bare `UnauthorizedException('Invalid credentials')` |
| `ACCOUNT_LOCKED` | ❌ not implemented — there is no lockout |
| `MFA_REQUIRED` | ⚠️ real inside `MfaGuard` as a 401 with `code: 'MFA_REQUIRED'` (`common/guards/mfa.guard.ts:48`), but unreachable: the guard is mounted on no route, it sets `code` rather than the `error` field the filter reads, and it returns 401 rather than the documented 403 |
| `TOKEN_EXPIRED` | ❌ not implemented as a code; the JWT library raises `TokenExpiredError`, which the filter maps to 401 with reason `"Unauthorized"` |
| `TOKEN_INVALID` | ❌ not implemented as a code |
| `SESSION_REVOKED` | ⚠️ partially — the message `"Refresh token has been revoked"` is real (`backend/src/modules/auth/auth.service.ts:566`) but it is a message, not a code |

### Real Error Response Format

This is what the API actually returns, produced by `AllExceptionsFilter`:

```json
{
  "error": "Unauthorized",
  "message": "Refresh token has been revoked",
  "details": [],
  "statusCode": 401,
  "timestamp": "2026-09-30T06:00:00.000Z",
  "path": "/api/v1/auth/refresh",
  "correlationId": "abc123xyz"
}
```

See `docs/api-contract/error-handling.md` for the full error-handling contract.

---

## Monitoring

### Metrics — ⛔ NOT IMPLEMENTED (auth-specific)
No authentication metrics are exported. A Prometheus registry **does** now exist and is scraped —
see the note below — but it exports no auth series: no login counter, no login-rate gauge, no
`auth_failures_total`, no MFA-failure counter. No auth dashboard is deployed either;
`monitoring/grafana/dashboards/hakawi-overview.json` exists in the repository but nothing applies it.
The application's observability routes are three: the public `GET /api/v1/metrics` (Prometheus
exposition), and the super-admin guarded `GET /api/v1/metrics/cache` and
`GET /api/v1/metrics/degradation` — none of the three counts an auth event.

> **Why this section was rewritten rather than extended.** It used to say "there is no Prometheus
> counter (no `prom-client` dependency)", which reads as "the application has no metrics at all".
> That is no longer true and was the weakest kind of wrong: it was inferred from a missing
> dependency rather than from the code. `backend/src/common/observability/prometheus-registry.ts` is a
> hand-written, zero-dependency registry — written by hand *because* `prom-client` is not installed
> and cannot be (the npm registry is unreachable). It declares six metrics: the counter
> `http_requests_total{method,route,status}`, recorded globally by
> `common/interceptors/metrics.interceptor.ts`, plus `process_uptime_seconds`,
> `process_resident_memory_bytes`, `process_heap_used_bytes`, `process_heap_total_bytes` and
> `nodejs_eventloop_lag_seconds`, sampled every 5 seconds by
> `common/observability/default-metrics.collector.ts`.
> `monitoring/prometheus/prometheus.yml` scrapes it as `job_name: 'hakawi-backend'` with
> `metrics_path: '/api/v1/metrics'`, and in production the same path is scraped through the Helm pod
> annotations. What this buys auth monitoring is the request counter — per-route 5xx rates,
> including on the `/auth/*` routes — and what it does not buy is any of the series named above.
> The distinction matters because the honest statement is "auth is unobserved", not "the application
> is unobserved" (Principle #4).

### Alerts
- ❌ Login failure-rate alerting: not implemented in practice — the rules file **no longer carries**
  `AuthFailureSpike`. It read `rate(auth_failures_total[5m]) > 20`, and the backend exports no
  `auth_failures_total` counter, so the expression was permanently empty and could never fire. The
  rule was deleted rather than left in place as documentation of intent, on the grounds that a rule
  nothing evaluates is worse than no rule: it reads as coverage. The unmet need is recorded in the
  comment block at the top of `monitoring/prometheus/rules/hakawi-alerts.yml` and returns the day the
  counter is emitted. What does exist is the generic error-rate alert `BackendHighErrorRate`
  (`http_requests_total{status=~"5.."}` over `http_requests_total`), which covers a 5xx storm on the
  auth routes without being auth-specific — and which is itself ⛔ undeployed
- ❌ Unusual-login-pattern alerting: not implemented — no rule for it exists in `monitoring/prometheus/rules/hakawi-alerts.yml`
- ❌ MFA-failure alerting: not implemented — no MFA-failure rule exists in `monitoring/prometheus/rules/hakawi-alerts.yml` (that file does exist, with **14 rules** covering backend/PostgreSQL/Valkey and host health; ⛔ no cluster deploys them), so neither `mfa.enabled` / `mfa.disabled` events nor failed `POST /auth/mfa/challenge` attempts are alerted on
- ❌ Token-abuse alerting: not implemented — the reuse-detection path logs and throws, but emits no metric or alert

What *is* observable today: Sentry receives unhandled (non-`HttpException`) errors via
`AllExceptionsFilter` → `captureSentryException` (`backend/src/common/observability/sentry.config.ts`),
and the WAF logs every rate-limit rejection with a correlation ID.

---

## Changelog — reconciliation (2026-09-30)

| Section | Change | Evidence |
|---|---|---|
| Refresh token type | "Random secure string" → **JWT** with `type: 'refresh'` and a separate secret | `backend/src/common/utils/jwt.util.ts:30` |
| Token storage (backend) | "Valkey with user ID as key" + "session metadata: device info, IP" → **no session record; only a refresh-token blacklist** | `backend/src/modules/auth/auth.service.ts:49,631-641` |
| Rotation | Confirmed real: the presented token is blacklisted before a new pair is issued | `backend/src/modules/auth/auth.service.ts:567-576` |
| MFA (TOTP + backup codes + the `/auth/mfa` routes) | Marked ⛔ **NOT IMPLEMENTED** in this reconciliation — now **superseded**: 6 routes in `mfa.controller.ts`, TOTP (RFC 6238) + 8 backup codes, migration `0029`. ⛔ Enforcement still open: `@RequireMfa()` has no call site, `MfaGuard` is on no route | `backend/src/modules/auth/mfa.controller.ts`, `mfa.service.ts`, `migrations/0029_add_mfa_support.sql` |
| Brute-force lockout / progressive delay / CAPTCHA | Marked ⛔ **NOT IMPLEMENTED**; only the `auth` rate-limit tier is real | `auth.service.ts` has no attempt counter; `backend/src/config/throttle.config.ts:32` |
| 5 concurrent sessions | Marked ⛔ **NOT IMPLEMENTED** | no per-user token index exists |
| Bulk session revocation by an admin | Marked ⛔ **NOT IMPLEMENTED** | — |
| Cookie `SameSite` | `lax` → **Strict**; all four cookie calls unified in one constants module | `backend/src/common/constants/auth-cookie.constants.ts:16-22` |
| Cookie parsing | Added: hand-written `parseCookieHeader` (no `cookie-parser` dependency) | `backend/src/common/constants/auth-cookie.constants.ts:24` |
| Cookie `Domain` | "Configurable" → ⛔ host-only, no `Domain` attribute | `backend/src/common/constants/auth-cookie.constants.ts:14-22` |
| Auth error codes | 6 documented codes → ⛔ none implemented | `backend/src/common/filters/all-exceptions.filter.ts:20` |
| Monitoring / alerts | Marked ⛔ **NOT IMPLEMENTED** in this reconciliation — now **superseded**: 14 alert rules + `alertmanager.yml` + a Grafana dashboard exist in `monitoring/` and a Prometheus scrape endpoint exists on the app, ⛔ nothing deploys them, and ⛔ no rule and no metric is auth-specific | `monitoring/prometheus/rules/hakawi-alerts.yml`, `monitoring/alertmanager/alertmanager.yml`, `monitoring/grafana/dashboards/hakawi-overview.json`; app routes `GET /api/v1/metrics` (public exposition), `/api/v1/metrics/cache` and `/api/v1/metrics/degradation` (super-admin JSON). The auth-specific rules this row used to name (`AuthFailureSpike`, `RateLimitExhausted`) were removed because their series (`auth_failures_total`, `rate_limit_exceeded_total`) are emitted by nothing |

---

*This document defines the authentication architecture for Hakawi.*
