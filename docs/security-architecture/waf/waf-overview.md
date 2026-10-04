# WAF Documentation
## Hakawi Security Architecture

This document defines the Web Application Firewall (WAF) implementation for Hakawi: the rule set,
request inspection, the Valkey-backed IP blocklist, logging, and operational controls. Every claim
below is annotated with its implementation status — ✅ implemented, ⚠️ partial, ⛔ not implemented.

The implementation lives in four files:
- `backend/src/common/waf/rules.ts` — the typed, data-driven rule table
- `backend/src/common/middleware/waf.middleware.ts` — the inspection pipeline
- `backend/src/common/waf/ip-blocklist.service.ts` — the Valkey blocklist
- `backend/src/config/waf.config.ts` — the zod-validated `WAF_*` configuration

---

## WAF Architecture

### Overview
The WAF is a single Express middleware, registered in `backend/src/main.ts` after the security
headers and before the global filters, so it sees every request that reaches the app:

```
WafMiddleware.use()  —  backend/src/common/middleware/waf.middleware.ts
```

It inspects up to **200** values and truncates each at **4096** characters, with a maximum JSON body
depth of **8** (`backend/src/common/middleware/waf.middleware.ts:41-44`). Those caps exist so a hostile body cannot make the WAF
itself expensive — the middleware is a DoS guard, and an unbounded one is a liability.

### Layers

The document previously described four abstract "layers" (rate limiting, threat detection, IP
blocking, logging) that did not correspond to anything in the code. The real rule table has **eight
typed layers** (`WAF_LAYERS`, `backend/src/common/waf/rules.ts:1-10`):

| Layer | Purpose |
|---|---|
| `method` | HTTP method allow-list |
| `body-size` | Request body size ceiling |
| `header-injection` | CRLF injection, forbidden forwarding headers |
| `injection` | SQLi, NoSQLi, LDAP, OS command injection |
| `xss` | Script tags, event handlers, `data:` URIs |
| `traversal` | Relative segments, sensitive files, null bytes |
| `ssrf` | Cloud metadata, private networks, non-HTTP schemes |
| `bot` | Scanner and automation user agents |

IP blocking and logging are **not rule layers**: blocking is a pipeline stage inside the
middleware, and logging is a side effect of a decision.

### Rule count: 34

`WAF_RULES` in `backend/src/common/waf/rules.ts` contains **34** rules, not the ~40 previously
claimed. Three rule *kinds* are supported, all typed:

| Kind | Mechanism | Example |
|---|---|---|
| `pattern` | `RegExp` (+ optional `requiresAny` precondition) | `sql-tautology` |
| `control-char` | Rejects a specific control character | `xss-data-uri` |
| `max-bytes` | Byte ceiling on the value | `body-size-limit` |

Each rule carries `id`, `name`, `layer`, `severity` (`low|medium|high|critical`), `targets`
(`url|query|body|header`), `description`, `enabledByDefault`, and a `sample`. Rules are individually
switchable off by id via `WAF_DISABLED_RULES`.

### ⚠️ Removed: the catastrophic body rule

An earlier rule blocked any request body containing `'`, `#`, or `--`. It 403'd ordinary Arabic and
English prose — apostrophes in names, hashtags in story text, em-dashes — which made the WAF
unusable for the platform's actual content. **That rule is gone.** The current SQLi rules are
structural (`sql-tautology`, `sql-dml-statement`, `sql-stacked-query`, `sql-comment-terminator`,
`sql-time-based`, `sql-file-access`, `sql-exec-eval`, `sql-tautology-numeric`) and are designed not
to fire on natural-language content. The full 73-test suite
(`backend/src/common/middleware/waf.middleware.spec.ts`) pins the behaviour.

---

## Rate Limiting — ✅ implemented

### Tiers

Rate limiting is **not** part of the WAF middleware. It is `@nestjs/throttler` with five tiers
defined in `backend/src/config/throttle.config.ts:26-63` and selected per route with
`@ThrottleTier('auth' | 'upload' | 'search')`.

| Tier | Limit | Window | Tracked by | `blockDurationMs` |
|---|---|---|---|---|
| `default` | 100 | 60s | user (falls back to IP when unauthenticated) | 0 |
| `auth` | 10 | 60s | IP | 60s |
| `upload` | 5 | 60s | user | 60s |
| `search` | 50 | 60s | user | 0 |

Every limit and window is overridable per tier (`THROTTLE_DEFAULT_LIMIT`, `THROTTLE_AUTH_TTL`, …).

### Storage — ✅ Valkey, not in-memory

`backend/src/common/throttler/valkey-throttler.storage.ts` implements `ThrottlerStorage` over
Valkey. This matters: the previous in-memory-per-instance storage meant the effective limit was
`limit × instance_count` behind a load balancer. Because the counters are now shared, the numbers in
the table are the real numbers. This also resolves the contradiction recorded at
`docs/11_decisions.md:78` — Valkey is now genuinely the rate-limit store, not just the cache.

**Fail mode:** fail-open. If Valkey is unreachable the request is allowed through, so a Valkey outage
degrades protection rather than taking the API down. This is deliberate and is covered by tests.

### 429 responses

There are real tests for the 429 path, and `RATE_LIMIT_EXCEEDED` responses carry `Retry-After`.
The escape hatch `THROTTLE_LIMIT` / `THROTTLE_TTL` overrides **every** tier at once; it exists
because `backend/vitest.config.e2e.ts` sets `THROTTLE_LIMIT=100000` to switch throttling off for the
database-backed suite. Leave both unset in production.

### Headers — ✅ implemented

`backend/src/common/waf/headers.ts:1-6`:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After`

---

## Threat Detection — ✅ implemented, 35 typed rules

Rule ids grouped by layer, all from `backend/src/common/waf/rules.ts`:

| Layer | Rule ids |
|---|---|
| `method` / `body-size` | `method-not-allowed`, `body-size-limit` |
| `header-injection` | `header-crlf-injection`, `header-forbidden-forwarding-headers` |
| SQL injection | `sql-tautology`, `sql-tautology-numeric`, `sql-comment-terminator`, `sql-dml-statement`, `sql-stacked-query`, `sql-time-based`, `sql-file-access`, `sql-exec-eval` |
| NoSQL / LDAP | `nosql-operator-injection`, `nosql-where-clause`, `ldap-filter-injection` |
| Command injection | `command-chain-separator`, `command-substitution`, `command-pipe-to-shell`, `command-destructive-rm`, `command-backtick-execution` |
| XSS | `xss-script-tag`, `xss-event-handler`, `xss-dangerous-element`, `xss-data-uri`, `xss-script-function` |
| Path traversal | `traversal-relative-segment`, `traversal-sensitive-file`, `traversal-server-config`, `traversal-null-byte` |
| SSRF | `ssrf-cloud-metadata`, `ssrf-private-network`, `ssrf-non-http-scheme` |
| Bot | `bot-scanner-user-agent`, `bot-automation-user-agent` |

### ⚠️ Documented threat classes with no rule

| Documented class | Status |
|---|---|
| XML injection (XXE) | ⛔ **NOT IMPLEMENTED** — no XML rule exists. Mitigated in practice because the API only parses JSON, but nothing enforces that |
| `INTO OUTFILE` / `INTO DUMPFILE` | ✅ covered by `sql-file-access` |
| `SLEEP()` / `BENCHMARK()` | ✅ covered by `sql-time-based` |
| `UNC` paths, `web.config`, `.htaccess` | ✅ covered by `traversal-server-config` |
| `nc -e`, `bash -i` | ⛔ no dedicated rule; only the generic command separators are matched |

---

## IP Blocking — ✅ implemented

`backend/src/common/waf/ip-blocklist.service.ts`. Fully Valkey-backed.

### Temporary Blocks
- **Duration:** `WAF_TEMP_BLOCK_SECONDS` (default 3600)
- **Trigger:** `WAF_VIOLATIONS_BEFORE_TEMP_BLOCK` (default 5) violations inside
  `WAF_VIOLATION_WINDOW_SECONDS` (default 900)
- **Auto-unblock:** ✅ Yes, via the Valkey TTL — there is no cleanup job
- **Storage:** Valkey with TTL

### Permanent Blocks
- **Duration:** Permanent until manually unblocked
- **Trigger:** `WAF_VIOLATIONS_BEFORE_PERMANENT_BLOCK` (default 25) violations
- **Auto-unblock:** No
- **Storage:** Valkey, no TTL

### Service API

```ts
// backend/src/common/waf/ip-blocklist.service.ts
await blocklist.block(ip, { kind: 'temporary' | 'permanent', reason, ttlSeconds });
await blocklist.unblock(ip);            // :131
await blocklist.isBlocked(ip);          // :106  → BlockRecord | null
await blocklist.listBlocked();          // :145
await blocklist.countViolations(ip);    // :164
await blocklist.recordViolation(ip, windowSeconds);  // :177
await blocklist.clearViolations(ip);    // :196
```

> The earlier snippet in this document used a positional `block(ip, durationSeconds, reason)` signature
> and an `isBlocked` returning `boolean`. Both were wrong: the real signature takes a `BlockOptions`
> object, and `isBlocked` returns the full `BlockRecord`.

### ⛔ Admin operations endpoints — NOT IMPLEMENTED

The service methods exist, but **nothing exposes them over HTTP.** There is no
`GET /admin/waf/blocked-ips`, no `POST /admin/waf/unblock-ip`, no
`POST /admin/waf/clear-counters`, and no `POST /admin/waf/clear-blocks` — a grep for
`admin/waf` across `backend/src` returns zero hits. **An operator blocked by the WAF today has no
supported way to unblock the IP except direct Valkey manipulation.** The service API is the intended
surface and is retained below as a requirement.

---

## Request Inspection

### Inspected Elements — ✅
- **Headers:** including `User-Agent`, `Referer`, `Content-Type`, and the forwarding headers
- **Query Parameters:** all query string values
- **Request Body:** parsed as JSON, flattened to a bounded list of values
- **URL Path:** the request path

### Pipeline order

1. Blocklist check — `isBlocked(clientIpOf(req))` (`backend/src/common/middleware/waf.middleware.ts:297`)
2. Method allow-list (`WAF_ALLOWED_METHODS`)
3. Body-size ceiling (`WAF_MAX_REQUEST_SIZE`)
4. Header rules
5. Injection rules
6. XSS rules
7. Traversal rules
8. SSRF rules
9. Bot rules
10. Violation accounting → block or observe

The earlier document claimed "rate limiting" as a pipeline stage. It is not: throttling is handled by
the Nest throttler guard, downstream of the WAF.

---

## Logging — ✅ implemented

### Levels
- **warn** — a violation was recorded (`WAF_LOG_VIOLATIONS=true`)
- **info** — blocks and unblocks, via `IpBlocklistService`
- **error** — blocklist storage failures (fail-open is recorded, then the request proceeds)

### Format

`buildWafViolationLog()` (`backend/src/common/waf/headers.ts:36`) emits one JSON line:

```json
{
  "level": "warn",
  "message": "WAF violation detected",
  "correlationId": "abc123",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "path": "/api/users",
  "method": "POST",
  "violationTypes": ["sql-tautology"],
  "severities": ["high"],
  "action": "blocked"
}
```

### Correlation IDs — ✅
Generated per request (`generateCorrelationId()`), accepted from an inbound `X-Correlation-Id` when
it matches `^[A-Za-z0-9_-]{1,128}$` (`resolveCorrelationId`), and echoed on the response as
`X-Request-Id` plus `AllExceptionsFilter` copies `x-correlation-id` into the error body's
`correlationId`.

### Response headers
`X-Waf-Blocked`, `X-Waf-Rule`, `X-Waf-Severity` (`backend/src/common/waf/headers.ts:7-12`).

---

## Security Headers — ⚠️ partial

### Application-level headers — ✅
Set by a hand-written map in `backend/src/main.ts:15-21`. There is **no `helmet` dependency**; the
earlier `app.use(helmet({...}))` snippet in `docs/deployment/deployment.md` was never real.

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   # production only
```

### ⛔ Headers NOT set
| Header | Status |
|---|---|
| `Content-Security-Policy` | ⛔ **NOT SET.** The earlier document listed `default-src 'self'`; no CSP is emitted anywhere |
| HSTS outside production | ⛔ Not set (deliberate — HSTS on a non-TLS dev origin is harmful) |
| `trust proxy` | ⛔ Not configured. Behind a reverse proxy the client IP the WAF sees is the proxy's, so per-IP throttling and blocking key on the wrong address until `THROTTLE_TRUST_PROXY=true` is set |

---

## Configuration — ✅ real

Parsed and zod-validated by `backend/src/config/waf.config.ts`; defaults match
`DEFAULT_WAF_CONFIG` in the same file. This is the complete, authoritative set.

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

### Corrections to the previous variable list

| Variable | Status |
|---|---|
| `WAF_RATE_LIMIT_ENABLED`, `WAF_RATE_LIMIT_REQUESTS`, `WAF_RATE_LIMIT_WINDOW` | ⛔ **DOES NOT EXIST.** Rate limiting is the throttler tier set (`THROTTLE_*`), not a WAF setting. Zero references in `backend/src` |
| `WAF_ADMIN_EMAIL`, `WAF_STRICT_REFERRER`, `WAF_FINGERPRINT_PROTECTION` | ⛔ **DOES NOT EXIST.** They appear in `backend/.env.example` but no code reads them — the example file is ahead of the code here. Zero references in `backend/src` |
| `WAF_BLOCKED_COUNTRIES` | ⚠️ parsed and stored, but **geo-blocking is not implemented** — the field is reserved and the `.env.example` comment says so |

---

## Monitoring — ⚠️ partial

### Implemented
- ✅ Structured WAF violation logs with correlation IDs
- ✅ IP block/unblock and violation-counter logs from `IpBlocklistService`
- ✅ `X-Waf-*` and `X-RateLimit-*` headers on responses
- ✅ Unhandled errors forwarded to Sentry

### ⛔ Not implemented
- ⛔ **No WAF metrics endpoint.** There is no `GET /api/v1/metrics/waf`; the only metrics endpoint in
  the application is `GET /api/v1/metrics/cache` (`backend/src/main.ts:96-98`).
- ⛔ **No counters** for total requests, blocked requests, rate-limited requests, violations by
  type, blocked-IP count, or active blocks.
- ⛔ **No dashboards.**
- ⛔ **No alerting.** The "block rate > 10%", "rate limit spikes", "new threat patterns" and "WAF
  errors" alerts in the previous version of this document do not exist.

Operators currently read structured logs. That is the whole story.

---

## Operations

### ⛔ Viewing and clearing blocks over HTTP — NOT IMPLEMENTED

```text
GET  /admin/waf/blocked-ips      ⛔ does not exist
POST /admin/waf/unblock-ip       ⛔ does not exist
POST /admin/waf/clear-counters   ⛔ does not exist
POST /admin/waf/clear-blocks     ⛔ does not exist
```

**Interim procedure** — call the service directly:

```ts
import { IpBlocklistService } from './common/waf/ip-blocklist.service.ts';
// in a Nest context:
const blocks = await ipBlocklistService.listBlocked();
await ipBlocklistService.unblock('192.168.1.1');
await ipBlocklistService.clearViolations('192.168.1.1');
```

**Intended procedure** — the four endpoints above, guarded by
`@Secured(AccountType.ADMIN) + @RequireAdminRole(AdminRole.SUPER_ADMIN)`. This is the pattern to
follow; the guards exist (`backend/src/common/decorators/secured.decorator.ts`), only the controller
is missing.

---

## Changelog — reconciliation (2026-09-30)

| Claim | Reality | Evidence |
|---|---|---|
| "~40 patterns" | **34** typed rules in 8 layers | `backend/src/common/waf/rules.ts` |
| "4 layers (rate limiting / threat detection / IP blocking / logging)" | 8 typed rule layers; blocking is a pipeline stage, logging a side effect, rate limiting a separate subsystem | `backend/src/common/waf/rules.ts:1-10` |
| Body rule blocking `'`, `#`, `--` | **Removed** — it 403'd ordinary Arabic and English prose | absent from `rules.ts`; 73-test `waf.middleware.spec.ts` |
| `WAF_RATE_LIMIT_*` variables | ⛔ Never existed. Rate limiting is the 4 throttler tiers | `backend/src/config/throttle.config.ts` |
| `WAF_ADMIN_EMAIL`, `WAF_STRICT_REFERRER`, `WAF_FINGERPRINT_PROTECTION` | ⛔ Read by no code; present only in `backend/.env.example` | zero references in `backend/src` |
| "Valkey with in-memory fallback" | ✅ Valkey via `ValkeyThrottlerStorage`, fail-open | `backend/src/common/throttler/valkey-throttler.storage.ts` |
| Rate-limit numbers 10 / 100 / 5 / 50 | ✅ Now actually true (five tiers — `default` is 30/min, and `session` was added so machine refresh does not share the `auth` budget; real 429 tests) | `backend/src/config/throttle.config.ts:26-63` |
| `X-RateLimit-*` headers | ✅ Real | `backend/src/common/waf/headers.ts:1-6` |
| IP blocking temp/permanent + auto-unblock | ✅ Real, Valkey TTL | `backend/src/common/waf/ip-blocklist.service.ts:79-164` |
| `ipBlocker.block(ip, durationSeconds, reason)` | Signature is `block(ip, BlockOptions)` | `backend/src/common/waf/ip-blocklist.service.ts:79` |
| `isBlocked` returns boolean | Returns `BlockRecord \| null` | `backend/src/common/waf/ip-blocklist.service.ts:106` |
| `GET /admin/waf/*` operations endpoints | ⛔ Not implemented; service methods exist, no controller | zero `admin/waf` hits in `backend/src` |
| XML injection detection | ⛔ No rule | — |
| Rate limiting as WAF pipeline stage 2 | Not part of the WAF; handled by the throttler guard | `backend/src/common/middleware/waf.middleware.ts:290-340` |
| CSP `default-src 'self'` | ⛔ No CSP is emitted | absent from `SECURITY_HEADERS` in `backend/src/main.ts:15-21` |
| Metrics: counts, dashboards, alerts | ⛔ None. Only structured logs | only `/api/v1/metrics/cache` exists |
| `WAF_BLOCKED_COUNTRIES` | Parsed, reserved; geo-blocking not implemented | `backend/src/config/waf.config.ts:38` |

---

*This document defines the WAF implementation for Hakawi.*
