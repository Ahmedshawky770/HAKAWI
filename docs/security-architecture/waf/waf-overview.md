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

## Threat Detection — ✅ implemented, 34 typed rules

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

### ✅ Admin operations endpoints — IMPLEMENTED (`admin/admin-waf.controller.ts`, `@Controller('admin/waf')`, registered in `admin.module.ts`)

`AdminWafController` (`backend/src/modules/admin/admin-waf.controller.ts`) exposes the blocklist
service over HTTP at `@Controller('admin/waf')` and is registered in `admin.module.ts:9`:
`GET blocked-ips`, `POST block-ip`, `POST unblock-ip`, `POST clear-counters`,
`POST clear-blocks`. **An operator blocked by the WAF now has a supported way to unblock the IP**
— every route is guarded by `JwtAuthGuard` + `@RequireAdminRole(AdminRole.SUPER_ADMIN)` on the
`default` throttle tier, so direct Valkey manipulation is no longer the only path. ⚠️
`clear-counters` / `clear-blocks` called without an `ip` in the body are stubs: they log a warning
and return `{ success: true }` without clearing anything. The service API is retained below.

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
Set by a hand-written map in `backend/src/main.ts:17-26`. There is **no `helmet` dependency**; the
earlier `app.use(helmet({...}))` snippet in `docs/deployment/deployment.md` was never real.

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   # production only
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

`Content-Security-Policy` is set from the same map — the earlier document listed
`default-src 'self'` as missing because `SECURITY_HEADERS` (`backend/src/main.ts:25`) did not carry
it yet. It now does.

### Headers NOT set
| Header | Status |
|---|---|
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
WAF_BLOCKED_COUNTRIES=                   # comma-separated ISO country codes; non-empty arms geo-blocking via GeoIpService (enforced in waf.middleware.ts)
```

### Corrections to the previous variable list

| Variable | Status |
|---|---|
| `WAF_RATE_LIMIT_ENABLED`, `WAF_RATE_LIMIT_REQUESTS`, `WAF_RATE_LIMIT_WINDOW` | ⛔ **DOES NOT EXIST.** Rate limiting is the throttler tier set (`THROTTLE_*`), not a WAF setting. Zero references in `backend/src` |
| `WAF_ADMIN_EMAIL`, `WAF_STRICT_REFERRER`, `WAF_FINGERPRINT_PROTECTION` | ⛔ **DOES NOT EXIST.** They appear in `backend/.env.example` but no code reads them — the example file is ahead of the code here. Zero references in `backend/src` |
| `WAF_BLOCKED_COUNTRIES` | ✅ parsed into `blockedCountries` and enforced — `GeoIpService.isBlocked(ip)` runs in `waf.middleware.ts` for the `geo-blocked-country` rule |

---

## Monitoring — ⚠️ partial

### Implemented
- ✅ Structured WAF violation logs with correlation IDs
- ✅ IP block/unblock and violation-counter logs from `IpBlocklistService`
- ✅ `X-Waf-*` and `X-RateLimit-*` headers on responses
- ✅ Unhandled errors forwarded to Sentry

### ⛔ Not implemented
- ⛔ **No WAF metrics endpoint.** There is no `GET /api/v1/metrics/waf`. The application's
  observability routes are three: the public Prometheus scrape endpoint `GET /api/v1/metrics`
  (`backend/src/common/observability/prometheus.controller.ts`), and the super-admin guarded JSON
  routes `GET /api/v1/metrics/cache` and `GET /api/v1/metrics/degradation`
  (`backend/src/common/observability/metrics.controller.ts:73,80`) — the latter two still count no
  WAF events, and the former counts requests, not WAF decisions.
- ⛔ **No counters** for total requests, blocked requests, rate-limited requests, violations by
  type, blocked-IP count, or active blocks.
- 🔄 **No dashboard is deployed.** `monitoring/grafana/dashboards/hakawi-overview.json` exists in the
  repository, but no cluster applies it. Its panels were reduced to series that exist: the WAF panels
  were deleted rather than left empty (see Task 1 of the reasoning below).
- 🔄 **No alerting is deployed.** `monitoring/prometheus/rules/hakawi-alerts.yml` (14 rules) and
  `monitoring/alertmanager/alertmanager.yml` exist, but no cluster applies them, and no WAF counter
  is exported for the rules to read. The rules file used to name `WAFHighViolationRate` and
  `WAFIPBlockedSurge`; **neither rule exists any more.** Both read series nothing emits
  (`waf_violations_total`, `waf_blocked_ips_total`), so their expressions were permanently empty —
  a rule that cannot fire is not partial coverage, it is none, and listing it here as if it guarded
  the WAF was the drift this pass removes. The "block rate > 10%", "rate limit spikes", "new threat
  patterns" and "WAF errors" alerts the previous version of this document listed still do not exist,
  and now no document claims they do.

Operators currently read structured logs, plus the three observability routes above — two of which
report nothing about the WAF, and the third of which reports nothing WAF-specific. That is the whole
story.

---

## Operations

### ✅ Viewing and clearing blocks over HTTP — IMPLEMENTED

```text
GET  /admin/waf/blocked-ips      ✅ exists (admin-waf.controller.ts); requires an admin role
POST /admin/waf/block-ip         ✅ exists (admin-waf.controller.ts); requires an admin role
POST /admin/waf/unblock-ip       ✅ exists (admin-waf.controller.ts); requires an admin role
POST /admin/waf/clear-counters   ✅ exists (admin-waf.controller.ts); requires an admin role
POST /admin/waf/clear-blocks     ✅ exists (admin-waf.controller.ts); requires an admin role
```

**Procedure** — call the endpoints above with a super-admin JWT (`JwtAuthGuard` +
`@RequireAdminRole(AdminRole.SUPER_ADMIN)` on `admin-waf.controller.ts`). ⚠️
`clear-counters` / `clear-blocks` without an `ip` in the body are stubs that log a warning and
return `{ success: true }` without clearing anything.

**Fallback for an operator with no super-admin token** — call the service directly:

```ts
import { IpBlocklistService } from './common/waf/ip-blocklist.service.ts';
// in a Nest context:
const blocks = await ipBlocklistService.listBlocked();
await ipBlocklistService.unblock('192.168.1.1');
await ipBlocklistService.clearViolations('192.168.1.1');
```

The earlier document described these four endpoints as the *intended* surface guarded by
`@Secured(AccountType.ADMIN) + @RequireAdminRole(AdminRole.SUPER_ADMIN)`, with only the controller
missing. The controller exists now, and the real guard pair is `JwtAuthGuard` +
`@RequireAdminRole` — `@Secured(AccountType.ADMIN)` is not used on this route.

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
| `GET /admin/waf/*` operations endpoints | ✅ Implemented — `admin-waf.controller.ts` serves `GET blocked-ips`, `POST block-ip`, `POST unblock-ip`, `POST clear-counters`, `POST clear-blocks` | `backend/src/modules/admin/admin-waf.controller.ts` |
| XML injection detection | ⛔ No rule | — |
| Rate limiting as WAF pipeline stage 2 | Not part of the WAF; handled by the throttler guard | `backend/src/common/middleware/waf.middleware.ts:290-340` |
| CSP `default-src 'self'` | ✅ CSP is emitted — `Content-Security-Policy` is in `SECURITY_HEADERS` (`backend/src/main.ts:25`) | `backend/src/main.ts` |
| Metrics: counts, dashboards, alerts | ⛔ No counters and no WAF metrics endpoint — structured logs are still the whole WAF story. Alert rules and a Grafana dashboard exist in `monitoring/` (14 rules; **no WAF rule is among them** — `WAFHighViolationRate` and `WAFIPBlockedSurge` were removed, not left as empty expressions), ⛔ deployed nowhere | `monitoring/prometheus/rules/hakawi-alerts.yml`, `monitoring/grafana/dashboards/hakawi-overview.json`; the app's observability routes are `/api/v1/metrics` (public, Prometheus exposition) + `/api/v1/metrics/cache` + `/api/v1/metrics/degradation` (super-admin JSON), and none of the three reports a WAF counter |
| `WAF_BLOCKED_COUNTRIES` | Enforced via `GeoIpService.isBlocked` in `waf.middleware.ts` | `backend/src/config/waf.config.ts:164` + `backend/src/common/waf/geo-ip.service.ts` |

---

*This document defines the WAF implementation for Hakawi.*
