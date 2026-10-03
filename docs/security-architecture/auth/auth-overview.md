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

## MFA (Multi-Factor Authentication) — ⛔ NOT IMPLEMENTED

**Status: not built. There is no MFA code in this repository.**

A `grep -rn "mfa\|totp\|two.factor\|2fa"` across `backend/src`, `frontend/src` and `packages/` returns
**zero** matches. There is no `POST /api/v1/auth/mfa`, no TOTP secret storage, no recovery-code table,
and no `mfa_required` branch in the login flow.

The section below is the **retained requirement**, not a description of the system. It is kept so the
capability is not silently lost; nothing in it may be cited as implemented.

### Intended TOTP-based MFA
- **Algorithm:** TOTP (RFC 6238)
- **Issuer:** Hakawi
- **Digits:** 6
- **Period:** 30 seconds
- **Secret:** Base32 encoded, stored encrypted

### Intended Recovery Codes
- **Count:** 10 codes
- **Format:** Alphanumeric, hyphen-separated
- **Storage:** Encrypted in database
- **Usage:** One-time use

### Intended MFA Flow
1. User enables MFA in settings
2. System generates TOTP secret and recovery codes
3. User scans QR code with authenticator app
4. User verifies first TOTP code
5. System stores encrypted secret
6. On login:
   - User enters password
   - If MFA enabled, prompt for TOTP code
   - Validate TOTP code
   - Create session

### Intended MFA Enforcement
- **Optional:** User can enable/disable
- **Admin enforcement:** Admin can require MFA for sensitive operations
- **Super admin:** Always required

### What exists instead

Account types include `admin`, and `POST /api/v1/auth/login` returns tokens directly. Because
`adminRole` is carried in the token and checked by the guards
(`backend/src/common/guards/roles.guard.ts`), an administrator account is protected by *authorization*
only. Until MFA lands, an admin account is exactly as strong as its password.

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
8. ❌ **System invalidates all sessions — NOT IMPLEMENTED.** No refresh token is blacklisted, so a
   password reset does not log the user out of existing sessions.

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
| `MFA_REQUIRED` | ❌ not implemented — there is no MFA |
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

### Metrics — ❌ NOT IMPLEMENTED
No authentication metrics are exported. There is no Prometheus counter, no login-rate gauge, and
no auth dashboard. The only metric endpoint in the application is `GET /api/v1/metrics/cache`.

### Alerts
- ❌ Login failure-rate alerting: not implemented
- ❌ Unusual-login-pattern alerting: not implemented
- ❌ MFA-bypass alerting: not applicable (no MFA)
- ❌ Token-abuse alerting: not implemented

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
| MFA (TOTP + recovery codes + `POST /auth/mfa`) | Marked ⛔ **NOT IMPLEMENTED**; requirement retained | zero matches for `mfa`/`totp` in `backend/src`, `frontend/src`, `packages/` |
| Brute-force lockout / progressive delay / CAPTCHA | Marked ⛔ **NOT IMPLEMENTED**; only the `auth` rate-limit tier is real | `auth.service.ts` has no attempt counter; `backend/src/config/throttle.config.ts:32` |
| 5 concurrent sessions | Marked ⛔ **NOT IMPLEMENTED** | no per-user token index exists |
| Bulk session revocation by an admin | Marked ⛔ **NOT IMPLEMENTED** | — |
| Cookie `SameSite` | `lax` → **Strict**; all four cookie calls unified in one constants module | `backend/src/common/constants/auth-cookie.constants.ts:16-22` |
| Cookie parsing | Added: hand-written `parseCookieHeader` (no `cookie-parser` dependency) | `backend/src/common/constants/auth-cookie.constants.ts:24` |
| Cookie `Domain` | "Configurable" → ⛔ host-only, no `Domain` attribute | `backend/src/common/constants/auth-cookie.constants.ts:14-22` |
| Auth error codes | 6 documented codes → ⛔ none implemented | `backend/src/common/filters/all-exceptions.filter.ts:20` |
| Monitoring / alerts | Marked ⛔ **NOT IMPLEMENTED** | only `GET /api/v1/metrics/cache` exists |

---

*This document defines the authentication architecture for Hakawi.*
