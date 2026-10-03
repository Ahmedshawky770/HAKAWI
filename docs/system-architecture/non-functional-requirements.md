# Non-Functional Requirements (NFRs)

## Hakawi - Performance, Reliability, and Scalability Specifications

> ## 📋 How to read this document
>
> An NFR is a **target**, not a description. This document mixes three very different things, and the
> previous version did not distinguish them:
>
> 1. **Targets** — legitimate to state. "< 200ms p95" is a goal. The goal has never been measured.
> 2. **Requirements** — legitimate to state. "Passwords use bcrypt cost 12" is a rule.
> 3. **Claims of implementation** — these are marked inline. Where a line previously asserted
>    something is *built* and it is not, it is now marked ⛔ or ⚠️ with the evidence.
>
> **A summary of every claim that was wrong is in
> [§12 Verification Status](#12-verification-status) at the end of this document.**
>
> Reconciled against the code on 2026-09-30.

---

## 1. Overview

This document defines the non-functional requirements for Hakawi. NFRs specify **how** the system
should perform, not **what** it should do.

### NFR Categories

1. **Performance** — Response times, throughput, resource utilization
2. **Reliability** — Uptime, error rates, recovery
3. **Scalability** — Horizontal and vertical scaling limits
4. **Security** — Authentication, authorization, data protection
5. **Maintainability** — Code quality, monitoring, debugging
6. **Availability** — Uptime targets, disaster recovery

---

## 2. Performance NFRs

### Response Time Targets — ⛔ NONE OF THESE HAS BEEN MEASURED

These are **goals**, not observations. There is no benchmark harness, no load test, no APM, and no
recorded latency data anywhere in the repository. Nothing below may be cited as a measurement.

| Endpoint Type | Target | p95 | p99 | Measured? |
|---------------|--------|-----|-----|-----------|
| **Auth endpoints** | < 200ms | < 300ms | < 500ms | ⛔ No |
| **Read endpoints** (stories, users) | < 100ms | < 200ms | < 400ms | ⛔ No |
| **Write endpoints** (create, update) | < 200ms | < 400ms | < 600ms | ⛔ No |
| **Search queries** | < 300ms | < 500ms | < 800ms | ⛔ No |
| **Payment webhooks** | < 500ms | < 800ms | < 1000ms | ⛔ No |
| **Static assets** | < 100ms | < 200ms | < 300ms | ⛔ No |

### Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **API requests/sec** | 1,000 | Per backend instance |
| **Concurrent users** | 10,000 | Simultaneous active users |
| **Database queries/sec** | 5,000 | Per database instance |
| **Cache hit rate** | > 90% | Valkey cache |
| **Webhook processing** | 100/sec | Paymob webhooks |

### Resource Utilization

| Resource | Target | Alert Threshold |
|----------|--------|-----------------|
| **CPU** | < 70% average | > 85% |
| **Memory** | < 80% average | > 90% |
| **Database connections** | < 80% of pool | > 90% |
| **Disk I/O** | < 70% | > 85% |
| **Network bandwidth** | < 70% | > 85% |

---

## 3. Rate Limiting and WAF

### Implementation

**Tool:** `@nestjs/throttler` + custom WAF middleware

### Rate Limits by Endpoint Type — ⚠️ rewritten: the table was fiction

**There are exactly four tiers**, defined in `backend/src/config/throttle.config.ts:26-63` and
applied per route with `@ThrottleTier(...)`. The previous version listed eight endpoint-specific
limits; **none of them matched the implementation.**

| Tier | Limit | Window | Scope | `blockDurationMs` | Overrides |
|------|-------|--------|-------|-------------------|-----------|
| `default` | 100 | 60s | per user (IP when unauthenticated) | 0 | `THROTTLE_DEFAULT_LIMIT`, `THROTTLE_DEFAULT_TTL` |
| `auth` | **10** | 60s | **per IP** | 60s | `THROTTLE_AUTH_LIMIT`, `THROTTLE_AUTH_TTL` |
| `upload` | **5** | 60s | per user | 60s | `THROTTLE_UPLOAD_LIMIT`, `THROTTLE_UPLOAD_TTL` |
| `search` | **50** | 60s | per user | 0 | `THROTTLE_SEARCH_LIMIT`, `THROTTLE_SEARCH_TTL` |

Corrections to the previous table:
- ⛔ **"Auth 5/min per IP"** → the real `auth` tier is **10/min per IP**
- ⛔ **"Auth 10/min per user"** → the `auth` tier is **per IP only**; there is no per-user auth tier
- ⛔ **"API endpoints (public) 50/min per IP"** → there is no separate public tier. The `default` tier
  applies and keys on the IP only when unauthenticated
- ⛔ **"Upload 10/min per user"** → the real `upload` tier is **5/min per user**
- ⛔ **"Search 50/min per IP"** → the real `search` tier is **50/min per user**, not per IP
- ⛔ **"Comments 30/min per user"** → **no such tier exists.** Comments are on the `default` tier
- ⛔ **"Payment webhooks: unlimited, whitelisted IPs"** → there is no webhook whitelist. The webhook
  route is `@Public()` and falls under the `default` tier like any other unauthenticated request
- ⚠️ `THROTTLE_LIMIT` / `THROTTLE_TTL` override **every** tier at once. They exist so the e2e suite can
  disable throttling (`backend/vitest.config.e2e.ts` sets `THROTTLE_LIMIT=100000`). Leave both unset
  in production
- ✅ Storage is `ValkeyThrottlerStorage` — shared across instances, so a limit is the real limit
  behind a load balancer. Fail mode is **fail-open**

### WAF Rule Examples

**SQL Injection Detection:**
```typescript
const sqlPatterns = [
  /SELECT/i, /INSERT/i, /UPDATE/i, /DELETE/i, /DROP/i,
  /UNION/i, /OR 1=1/i, /AND 1=1/i, /--/i, /#/i,
  /EXEC/i, /EVAL/i, /INTO OUTFILE/i, /SLEEP\(/i
];

if (sqlPatterns.some(pattern => pattern.test(input))) {
  throw new WAFViolationException('SQL injection detected');
}
```

**XSS Detection:**
```typescript
const xssPatterns = [
  /<script>/i, /javascript:/i, /onload=/i, /onerror=/i,
  /<iframe>/i, /<object>/i, /eval\(/i, /alert\(/i
];

if (xssPatterns.some(pattern => pattern.test(input))) {
  throw new WAFViolationException('XSS detected');
}
```

**Path Traversal Detection:**
```typescript
const pathTraversalPatterns = [
  /\.\.\//, /\.\.\\/, /%2e%2e%2f/i, /%2e%2e\//i
];

if (pathTraversalPatterns.some(pattern => pattern.test(input))) {
  throw new WAFViolationException('Path traversal detected');
}
```

### Resource Quotas per User/Tenant — ⛔ NOT IMPLEMENTED

**No quota system exists.** There is no tier, no balance, and no counter that deducts. The table
below is a **retained requirement**, not a description.

| Resource | Free Tier | Premium Tier | Enterprise |
|----------|-----------|--------------|------------|
| **Stories per month** | 10 | 100 | Unlimited |
| **Books per user** | 5 | 50 | Unlimited |
| **Storage per user** | 100 MB | 1 GB | 10 GB |
| **API requests per minute** | 50 | 200 | 1000 |
| **Concurrent uploads** | 1 | 3 | 10 |
| **Messages per day** | 50 | 500 | Unlimited |
| **Search queries per minute** | 30 | 100 | 500 |

**What exists instead:** the `@nestjs/throttler` tiers in §3, which limit a window in seconds, not a
monthly allowance. They are rate limits, **not quotas** — they do not accumulate a balance and they
reset every 60 seconds. A user can create an unbounded number of stories per month.

**Retained requirement — the intended shape** (not implemented; `QuotaExceededException` does not
exist, and `user.quota` is not a column):

```typescript
// Intended, NOT IMPLEMENTED
async createStory(userId: string) {
  const user = await this.usersRepository.findById(userId);
  const storiesThisMonth = await this.storiesRepository.countThisMonth(userId);

  if (storiesThisMonth >= user.quota.storiesPerMonth) {
    throw new QuotaExceededException('Monthly story limit reached');   // ⛔ no such class
  }

  // ... create story
}
```

### Rate Limiting Strategy — ⚠️ the snippet below is not how it works

```typescript
// ⛔ INTENDED, NOT IMPLEMENTED. There is no `ThrottlerGuard` in this codebase and no
// `rate-limit:{user}:{endpoint}` key. The real implementation is Nest's stock ThrottlerGuard
// paired with a custom Valkey storage adapter that it delegates to.
```

The real path:
1. `ValkeyThrottlerStorage.increment()` (`backend/src/common/throttler/valkey-throttler.storage.ts`)
   increments a fixed per-tier Valkey key and returns `{ totalHits, timeToExpire }`
2. Nest's `@nestjs/throttler` `ThrottlerGuard` compares `totalHits` against the tier limit
3. On breach it returns **429** with `Retry-After`, writing its own body and **bypassing
   `AllExceptionsFilter`**
4. The key is per tier, not per endpoint — so all routes on the `auth` tier share one counter

There is **no per-endpoint key**, so the `endpoint = request.route.path` line in the previous
snippet has no counterpart.

### Rate Limit Headers

The previous version listed them as a target. They are ✅ **real**, in
`backend/src/common/waf/headers.ts:1-6`:
`X-RateLimit-Limit` · `X-RateLimit-Remaining` · `X-RateLimit-Reset` · `Retry-After` (429 only)
  }
}
```

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700000000
```

---

## 4. Circuit Breaker

### Purpose

Prevent cascade failures when external services are unavailable.

### External Services Requiring Circuit Breakers — ⚠️ 2 of 5 are wired

`CircuitBreakerService` (`backend/src/common/resilience/circuit-breaker.service.ts`) and
`ResilientHttpClient` exist and are real. **They are injected in only two places.**

| Service | Wired? | Evidence |
|---|---|---|
| **Sanity CMS** | ✅ | `CircuitBreakerService` injected at `backend/src/modules/stories/sanity/sanity.service.ts` |
| **Paymob** | ✅ | `ResilientHttpClient` at `backend/src/modules/payments/clients/paymob.client.ts:85` — retry + breaker + timeout + fallback |
| **OAuth providers** | ✅ | `CircuitBreakerService` injected at `backend/src/modules/auth/auth.service.ts:59` |
| **Email service** | ⛔ | **No SMTP client exists at all.** Only `EMAIL_FROM` is read |
| **Storage (R2/S3)** | ⛔ | The S3 presigner is called with no breaker |
| **PostgreSQL / Valkey** | ⛔ | No breaker. Both fail open, so an outage degrades protection rather than refusing service |

Defaults are env-tunable, and the previous "50% failure rate" figure does not exist:
`CIRCUIT_BREAKER_FAILURE_THRESHOLD=5` (absolute count, not a rate),
`CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS=30000`, `CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3`,
`CIRCUIT_BREAKER_MONITORING_PERIOD_MS=60000`.

### Circuit Breaker States

```
CLOSED (normal) → OPEN (failure) → HALF-OPEN (testing) → CLOSED (recovery)
```

### Implementation

```typescript
@Injectable()
class SanityService {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      fallback: () => ({ content: null, fallback: true }),
    });
  }

  async getStoryContent(storyId: string) {
    return this.circuitBreaker.fire(async () => {
      const response = await fetch(`${SANITY_URL}/documents/story_${storyId}`);
      return response.json();
    });
  }
}
```

### Circuit Breaker Monitoring

| Metric | Alert Threshold |
|--------|----------------|
| **Circuit breaker state changes** | Any OPEN state |
| **Fallback activation rate** | > 10% of requests |
| **Recovery time** | > 5 minutes |

---

## 5. Database Connection Pooling

### PostgreSQL Connection Pool

**Tool:** `pg-pool` (built into node-postgres)

### Configuration — ⚠️ pool sizing is NOT configurable

**Tool:** `pg-pool` (built into node-postgres) — ✅ real.

⛔ **The previous version's `pool: { min, max, idleTimeoutMillis, connectionTimeoutMillis,
statement_timeout }` block does not exist, and the `DB_POOL_MIN` / `DB_POOL_MAX` /
`DB_POOL_IDLE_TIMEOUT` variables are read by nothing.** `backend/src/config/database.config.ts`
validates only `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`.
`DB_SSL` is likewise unread.

Sizing is therefore a code constant in `backend/src/db/index.ts`, identical in every environment. The
"by environment" table below is a **requirement, not current behaviour** — and with no deployment
artifact there is no environment-specific configuration to change.

### Connection Pool by Environment — ⛔ NOT IMPLEMENTED

| Environment | Min Connections | Max Connections | Reality |
|-------------|----------------|----------------|---------|
| **Development** | 2 | 5 | ⛔ Not distinguished — one constant for all environments |
| **Staging** | 5 | 10 | ⛔ Not distinguished |
| **Production** | 10 | 20 | ⛔ Not distinguished |
| **Production (scaled)** | 20 | 50 | ⛔ Not distinguished |

⚠️ To make this real, add `DB_POOL_MAX` to the zod schema in `database.config.ts` and pass it to the
`new Pool({...})` call. `docs/deployment/environment.md` → *Database* records the current state.

### Monitoring

| Metric | Target | Alert |
|--------|--------|-------|
| **Active connections** | < 70% of max | > 90% of max |
| **Idle connections** | > 20% of min | < 5% of min |
| **Connection wait time** | < 100ms | > 500ms |
| **Connection errors** | 0 | > 0 |

---

## 6. Valkey TTL and Invalidation Strategy

### Cache TTL by Entity — ⚠️ 3 real TTLs out of 21 documented rows

The cache is `@Cacheable` / `@CacheInvalidateTags` driven, keyed by the decorated method's arguments
— **not** by a hand-written key template. There is **no `cache.config.ts`**; the previous version's
config block is fictional. And **there is no session cache**: `session:{userId}` does not exist,
because there is no session store.

**Real TTLs** (compile-time constants, **not** configurable — no `CACHE_TTL_*` variable is read):

| Entity | Tag | TTL | Constant |
|---|---|---|---|
| **Story** | `stories` | **600s (10 min)** | `STORY_CACHE_TTL_SECONDS` — `backend/src/modules/stories/stories.service.ts:26` |
| **Book** | `books` | **600s (10 min)** | `BOOK_CACHE_TTL_SECONDS` — `backend/src/modules/books/books.service.ts:32` |
| **Payment** | `payments` | **300s (5 min)** | `PAYMENT_CACHE_TTL_SECONDS` — `backend/src/modules/payments/payments.service.ts:42` |
| *(any other `@Cacheable`)* | — | **3600s (1 h)** | `DEFAULT_CACHE_TTL_SECONDS` — `backend/src/common/decorators/cache.decorator.ts:9` |
| **Paymob auth token** | — | 3000s | `PAYMOB_AUTH_TOKEN_CACHE_TTL_SECONDS` — clamped below Paymob's 3600s token lifetime |

**Invalidation is tag-based, not key-based** — `@CacheInvalidateTags` on write, so no per-entity
invalidation rules are needed:

```typescript
// real pattern
@CacheInvalidateTags({ tags: ['stories'] })
async update(id: string, input: UpdateStoryInput, userId: string): Promise<Story> { /* ... */ }
```

**⛔ Rows in the previous table that correspond to no cached entity:** User Session (no session
store), User Profile, User Statistics, Story Content, Story Metadata, Story Feed, Story Views,
Search Results, Notifications (unread / list), Trending Stories, Categories, Tags, User Library,
Contest Details, Contest Submissions, Messages (list / count). Each of these would be a plausible
cache to add, but none is cached today.

**⚠️ Rows that are real but use a different mechanism:**

| Documented row | Reality |
|---|---|
| **Rate Limits** `rate-limit:{key}:{endpoint}` | ⛔ Wrong shape. `ValkeyThrottlerStorage` keys on a fixed **per-tier** key, not per endpoint |
| **WAF State** `waf:block:{ip}` | ⚠️ The concept is right; the key is a Valkey set, not a single string key, and the TTL is `WAF_TEMP_BLOCK_SECONDS` (default 3600), not 5 minutes. Permanent blocks have **no** TTL |

### Valkey Configuration — ⚠️ only the connection is configured

⛔ **There is no `cache.config.ts`.** The previous version's `maxmemory`, `save`, `eviction-policy`,
and `timeout` block describes a `valkey.conf` the repository does not contain — `find . -name
'valkey.conf'` returns nothing, and `docker-compose.yml` starts Valkey with **no** command
override, so it runs the image default.

The only Valkey configuration the application owns (`backend/src/config/valkey.config.ts`):

```typescript
const envSchema = z.object({
  VALKEY_HOST: z.string().default('localhost'),
  VALKEY_PORT: z.coerce.number().default(6379),
  VALKEY_PASSWORD: z.string().optional(),
});
```

⚠️ Memory, persistence, and eviction are therefore **operator responsibilities** with no in-repo
policy. This is a real operational gap: `allkeys-lru` eviction on a Valkey instance also holding the
refresh-token blacklist and the rate-limit counters would silently drop security state.

⚠️ Separately, `backend/src/redis-io.adapter.ts` configures the Socket.IO Redis adapter from
`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` — a **different variable family** from the
`VALKEY_*` the cache uses. Both families exist and must both be set.

### Cache Invalidation Rules

#### Tag-based Invalidation

Invalidate all caches for a user or story with a single command:

```typescript
// Invalidate all caches for a user
await cache.invalidateTag(`user:${userId}`);

// Invalidate all caches for a story
await cache.invalidateTag(`story:${storyId}`);

// Invalidate all caches for a contest
await cache.invalidateTag(`contest:${contestId}`);
```

**Tag Mapping:**
```
user:{userId}
├── user:profile:{userId}
├── user:stats:{userId}
├── library:{userId}
├── messages:{userId}:*
└── notifications:*

story:{storyId}
├── story:content:{storyId}
├── story:meta:{storyId}
└── story:views:{storyId}

contest:{contestId}
├── contest:details:{contestId}
└── contest:submissions:{contestId}
```

#### Event-based Invalidation

Subscribe to events and invalidate cache automatically:

```typescript
// User events
this.eventBus.subscribe('user.updated', (event) => {
  cache.invalidateTag(`user:${event.payload.userId}`);
});

this.eventBus.subscribe('user.verified', (event) => {
  cache.invalidate(`user:profile:${event.payload.userId}`);
  cache.invalidate(`user:stats:${event.payload.userId}`);
});

// Story events
this.eventBus.subscribe('story.created', (event) => {
  cache.invalidate(`feed:${event.payload.authorId}`);
  cache.invalidate('trending:stories');
});

this.eventBus.subscribe('story.published', (event) => {
  cache.invalidateTag(`story:${event.payload.storyId}`);
  cache.invalidate(`feed:${event.payload.authorId}`);
  cache.invalidate('trending:stories');
});

this.eventBus.subscribe('story.updated', (event) => {
  cache.invalidateTag(`story:${event.payload.storyId}`);
});

this.eventBus.subscribe('story.deleted', (event) => {
  cache.invalidateTag(`story:${event.payload.storyId}`);
  cache.invalidate(`feed:${event.payload.authorId}`);
});

// Reaction events
this.eventBus.subscribe('reaction.created', (event) => {
  cache.invalidate(`story:meta:${event.payload.targetId}`);
});

// Comment events
this.eventBus.subscribe('comment.created', (event) => {
  cache.invalidate(`story:meta:${event.payload.storyId}`);
});

// Follow events
this.eventBus.subscribe('follow.created', (event) => {
  cache.invalidate(`user:stats:${event.payload.followingId}`);
});

// Book events
this.eventBus.subscribe('book.purchased', (event) => {
  cache.invalidate(`library:${event.payload.buyerId}`);
});

this.eventBus.subscribe('book.rented', (event) => {
  cache.invalidate(`library:${event.payload.renterId}`);
});

// Notification events
this.eventBus.subscribe('notification.created', (event) => {
  cache.invalidate(`notifications:unread:${event.payload.userId}`);
  cache.invalidate(`notifications:list:${event.payload.userId}`);
});

this.eventBus.subscribe('notification.read', (event) => {
  cache.invalidate(`notifications:unread:${event.payload.userId}`);
  cache.invalidate(`notifications:list:${event.payload.userId}`);
});

// Message events
this.eventBus.subscribe('message.created', (event) => {
  cache.invalidate(`messages:unread:${event.payload.recipientId}`);
  // Invalidate conversation cache for both users
  cache.invalidate(`messages:${event.payload.senderId}:conversation:${event.payload.recipientId}`);
  cache.invalidate(`messages:${event.payload.recipientId}:conversation:${event.payload.senderId}`);
});

// Contest events
this.eventBus.subscribe('contest.created', (event) => {
  cache.invalidate(`contest:details:${event.payload.contestId}`);
});

this.eventBus.subscribe('contest.submission_created', (event) => {
  cache.invalidate(`contest:submissions:${event.payload.contestId}`);
});
```

#### Explicit Invalidation

Invalidate cache on write operations:

```typescript
// User service
async updateUser(userId: string, data: UpdateUserDto) {
  await this.repository.update(userId, data);
  await this.cache.invalidateTag(`user:${userId}`);
}

// Story service
async updateStory(storyId: string, data: UpdateStoryDto) {
  await this.repository.update(storyId, data);
  await this.cache.invalidateTag(`story:${storyId}`);
}

async publishStory(storyId: string) {
  await this.repository.update(storyId, { status: 'published' });
  await this.cache.invalidateTag(`story:${storyId}`);
  await this.cache.invalidate(`feed:${authorId}`);
  await this.cache.invalidate('trending:stories');
}

// Notification service
async markAsRead(notificationId: string, userId: string) {
  await this.repository.update(notificationId, { read: true });
  await this.cache.invalidate(`notifications:unread:${userId}`);
  await this.cache.invalidate(`notifications:list:${userId}`);
}
```

#### Cache Warming

Pre-populate cache on application startup or after invalidation:

```typescript
// Warm cache on startup
async warmCache() {
  // Cache categories
  const categories = await this.categoriesRepository.findAll();
  await this.cache.set('categories:all', categories, 3600); // 1 hour

  // Cache tags
  const tags = await this.tagsRepository.findAll();
  await this.cache.set('tags:all', tags, 3600); // 1 hour

  // Cache trending stories
  const trending = await this.storiesRepository.findTrending();
  await this.cache.set('trending:stories', trending, 1800); // 30 minutes
}
```
async updateUser(userId: string, data: UpdateUserDto) {
  await this.repository.update(userId, data);
  await this.cache.invalidateTag(`user:${userId}`);
}
```

---

## 7. Security NFRs

### Authentication & Authorization

| Requirement | Target | Status |
|-------------|--------|--------|
| **Password hashing** | bcrypt, cost factor 12 | ✅ Real — `backend/src/common/utils/password.util.ts:7` |
| **JWT expiration** | 15 min access / 7 d refresh | ✅ Real — `backend/src/config/jwt.config.ts` |
| **Session timeout** | 24 h (remember me), 1 h (default) | ⛔ **NOT IMPLEMENTED.** There is no session store, no session timeout, and no "remember me". A session is a JWT pair; the only server-side state is the refresh-token blacklist |
| **MFA support** | TOTP (Google Authenticator) | ⛔ **NOT IMPLEMENTED.** `grep -rn "mfa\|totp\|two.factor\|2fa"` across `backend/src`, `frontend/src`, `packages/` returns **zero** matches. No `POST /auth/mfa`, no TOTP secret, no recovery codes. An admin account is protected by authorization only |
| **OAuth providers** | Google, Apple, Facebook, GitHub, TikTok | ✅ All 5 real. ⚠️ the variable names are `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` and `TIKTOK_CLIENT_KEY`, **not** the `FACEBOOK_CLIENT_ID` / `TIKTOK_CLIENT_ID` in `backend/.env.example` |
| **Account lockout** | — | ⛔ **NOT IMPLEMENTED.** `auth.service.ts` keeps no attempt counter. The only brake on credential stuffing is the `auth` tier: 10/min per IP |

### Data Protection

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| **Encryption at rest** | PostgreSQL TDE, Valkey encryption | ⚠️ **Partial.** ✅ `EncryptionService` does AES-256-GCM on `password_reset_token` and `email_verification_token`. ⛔ **PostgreSQL TDE is not enabled** (there is no `valkey.conf`, and no Postgres config beyond the image default) |
| **Encryption in transit** | TLS 1.3 everywhere | ⚠️ A **deployment** responsibility. The app sets no HTTPS redirect, calls no `trust proxy`, and configures no TLS. HSTS is emitted, but only when `NODE_ENV === 'production'` |
| **Sensitive data** | Encrypted in database (PII) | ⚠️ Only the two token columns. ⛔ There is **no phone number** in the schema and **no other PII is encrypted** |
| **Secrets management** | Environment variables, Vault for production | ⚠️ Environment variables only. ⛔ No Vault/AWS Secrets Manager integration exists |
| **Audit logging** | All sensitive operations logged | ⚠️ Structured Winston logs + Sentry. ⛔ **No permission-decision audit trail** — see `docs/security-architecture/permissions/permissions-overview.md` |

### Rate Limiting

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| **API rate limits** | Per-user and per-IP limits | ✅ Real — 4 tiers, `ValkeyThrottlerStorage` |
| **Login rate limits** | ~~5 attempts per minute per IP~~ | ✅ Real at **10/min per IP** (the `auth` tier). The previous figure was wrong |
| **Password reset** | 3 attempts per hour per email | ⛔ **NOT IMPLEMENTED.** `/auth/forgot-password` is on the `auth` tier (10/min per IP) and nothing else |
| **API key rotation** | Every 90 days | ⛔ No API keys exist; `ENCRYPTION_KEY`, `JWT_SECRET`, and `REFRESH_TOKEN_SECRET` are secrets but nothing rotates them |

---

## 8. Availability NFRs

### Uptime Targets

| Environment | Uptime Target | Allowed Downtime |
|-------------|---------------|------------------|
| **Production** | 99.9% | ~8.76 hours/year |
| **Staging** | 99.0% | ~87.6 hours/year |
| **Development** | No SLA | N/A |

### Disaster Recovery

| Metric | Target | Status |
|--------|--------|--------|
| **RPO (Recovery Point Objective)** | 1 hour | ⛔ Unachievable today — nothing backs the database up automatically |
| **RTO (Recovery Time Objective)** | 4 hours | ⛔ Unachievable today — no restore drill, no artifact to restore onto |
| **Backup frequency** | Daily full backup, hourly incremental | ⛔ **NOT IMPLEMENTED.** No backup job, no `pg_dump` schedule, no PITR config, no CI step. `pg_dump` appears only as a manual command inside a doc |
| **Backup retention** | 30 days | ⛔ Nothing retains anything |
| **Cross-region replication** | Yes (future) | ⛔ Not built, and marked "future" even here |

### Backup Strategy

| Data Type | Backup Method | Frequency | Retention | Status |
|-----------|--------------|----------|-----------|--------|
| **PostgreSQL** | pg_dump + WAL archiving | Daily full, hourly incremental | 30 days | ⛔ **NOT AUTOMATED** — a manual procedure only |
| **Valkey** | RDB snapshot | Every 6 hours | 7 days | ⛔ No configuration. ⚠️ note the state at risk: the refresh-token blacklist and the rate-limit counters |
| **Sanity content** | Sanity export | Daily | 30 days | ⛔ No export job |
| **File uploads** | R2/S3 replication | Real-time | 30 days | ⛔ Depends entirely on the storage provider; nothing configured in-repo |

⚠️ `docs/deployment/backup.md` additionally backed up a `nginx.conf` and a root `scripts/` directory
for the configuration backup. **Neither exists.** The `tar` command in that document could not have
succeeded. See the changelog in `backup.md` for the corrected command.

---

## 9. Monitoring & Observability NFRs

### Logging

| Requirement | Implementation |
|-------------|----------------|
| **Log format** | Structured JSON |
| **Log level** | debug (dev), info (prod) |
| **Log retention** | 90 days |
| **Correlation IDs** | Required for all requests |
| **Sensitive data** | Never logged (passwords, tokens) |

### Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| **API response time (p95)** | < 200ms | > 500ms |
| **Error rate** | < 0.1% | > 1% |
| **Database query time (p95)** | < 50ms | > 200ms |
| **Cache hit rate** | > 90% | < 80% |
| **Queue depth** | < 100 | > 500 |
| **CPU utilization** | < 70% | > 85% |
| **Memory utilization** | < 80% | > 90% |

### Tracing

| Requirement | Implementation |
|-------------|----------------|
| **Trace sampling** | 10% of requests |
| **Trace storage** | 7 days |
| **Correlation** | Request ID across all services |

---

## 10. Maintainability NFRs

### Code Quality

| Requirement | Target | Status |
|-------------|--------|--------|
| **Code coverage** | > 80% overall, 90% for critical modules | ✅ **Backend met:** S 85.43 / 82.39 / 79.00 / 85.58 against floors 78/70/73/79 plus 9 per-path ratchets. ⚠️ **Frontend not met:** S 39.79 / 35.90 / 35.74 / 40.22 against floors 38/33/33/38 — the frontend gate encodes the current number rather than the target, so a passing build certifies roughly 40%. ⛔ The "90% for critical modules" tier was never configured as a floor. **The unified roadmap target is ≥ 80% everywhere** — this "90% for critical modules" split is retired |
| **Cyclomatic complexity** | < 10 per function | ⛔ No complexity rule is configured in `backend/.eslintrc.cjs` |
| **Technical debt ratio** | < 5% | ⛔ Not measured; no tooling |
| **Code review coverage** | 100% of changes | ⚠️ A 10-job CI pipeline gates every push and PR, but no `CODEOWNERS` file and no required-reviewer configuration exist in the repo |

### Documentation

| Requirement | Target | Status |
|-------------|--------|--------|
| **API documentation** | 100% of endpoints | ⚠️ `@nestjs/swagger` is served at `/api/docs` and `/api/docs-json`, but coverage is **not** 100% — the Zod DTOs in `moderation/dto/` are invisible to `class-validator`, so the decorators cannot see them. `docs/api-contract/openapi/rest-api-spec.md` is the hand-maintained fallback and was reconciled on 2026-09-30 |
| **Code comments** | Complex logic only | ✅ Matches the repo convention |
| **README** | Every module | ⛔ **NOT TRUE.** Only `backend/src/modules/search/README.md` exists. `c4-model/component/module-boundaries.md` previously told new joiners to read their module's README |
| **Changelog** | Updated with every release | ⛔ **No CHANGELOG file exists in the repository** |

### Deployment

| Requirement | Target |
|-------------|--------|
| **Deployment frequency** | Multiple per day |
| **Lead time** | < 1 hour |
| **MTTR (Mean Time To Recovery)** | < 1 hour |
| **Change failure rate** | < 5% |

---

## 11. Scalability NFRs

### Horizontal Scaling

| Component | Scaling Strategy | Max Instances | Status |
|-----------|-----------------|---------------|--------|
| **Frontend** | Auto-scale (Vercel) | Unlimited | ✅ `next build` succeeds. The root `build` script builds shared-types first |
| **Backend** | Horizontal pod autoscaling | 10+ instances | ⚠️ **Stateless and horizontally safe** — no in-process session state, and the cache and rate-limit counters are in Valkey, so the previous per-instance in-memory throttler problem is gone. ⛔ But there is **no deployment artifact**, so no autoscaler has anything to scale. See `system-architecture/infrastructure/read-replicas.md` |
| **PostgreSQL** | Read replicas | 1 primary + 3 replicas | ⛔ **NOT BUILT.** One primary. `grep -rni replica --include='*.ts' backend/src/` returns nothing, and there is no `DB_REPLICA_*` variable |
| **Valkey** | Cluster mode | 3+ nodes | ⛔ Not configured. ⛔ Also a **single point of failure**: the cache, the refresh-token blacklist, the rate-limit counters, and the WAF blocklist all live in it, and both the cache and the throttler **fail open** |
| **Sanity** | Managed service | Unlimited | ⚠️ Wrapped in a `CircuitBreakerService` with a PostgreSQL fallback |

### Vertical Scaling

| Component | Min Spec | Recommended Spec |
|-----------|----------|------------------|
| **Backend instance** | 1 CPU, 2GB RAM | 2 CPU, 4GB RAM |
| **PostgreSQL** | 2 CPU, 4GB RAM | 4 CPU, 8GB RAM |
| **Valkey** | 1 CPU, 2GB RAM | 2 CPU, 4GB RAM |

---

## 12. Verification Status

### The previous per-phase checklist — replaced

The old table claimed ✅ for **"Response time < 200ms"**, **"Monitoring dashboards"**, and
**"Backup strategy"** in Phase 1, and ✅ for **"Load testing"** in Phase 4+. **None of those four is
true.** A per-phase checklist that marks unmeasured or unbuilt work as done is worse than no
checklist, so it is replaced by a status-per-claim table.

### Status of every NFR, as of 2026-09-30

| NFR | Status | Evidence |
|---|---|---|
| Response time < 200ms p95 | ⛔ **Never measured** | No benchmark harness, no load test, no APM. Targets are unverified |
| Throughput targets | ⛔ Never measured | — |
| Cache hit rate > 90% | 🔄 **Instrumented, not verified** | `GET /api/v1/metrics/cache` reports `hits`/`misses`/`hitRate`. No threshold is enforced and no value has been recorded |
| Resource utilisation targets | ⛔ No metrics pipeline | No Prometheus endpoint, no metrics registry |
| Rate limiting implemented | ✅ **Real** | 4 tiers over `ValkeyThrottlerStorage`; real 429 tests |
| Rate limit values | ⚠️ **Corrected** | 100/10/5/50, not the 8-row table the previous version listed |
| Resource quotas per user/tenant | ⛔ **Not implemented** | No tiers, no balances, no counters. Rate limits ≠ quotas |
| Circuit breakers configured | ⚠️ **Partially** | Wired into Sanity, Paymob, and OAuth. Not into S3, email (doesn't exist), PostgreSQL, or Valkey |
| Connection pooling tuned | ⛔ **Not configurable** | `DB_POOL_*` read by nothing. One constant for all environments |
| Valkey TTLs configured | ⚠️ **3 real TTLs** | 600s stories/books, 300s payments, 3600s default — compile-time constants, not env vars |
| Cache invalidation | ✅ **Real** | `@CacheInvalidateTags` on every write, tags `stories`/`books`/`payments` |
| Monitoring dashboards | ⛔ **None exist** | Sentry receives errors; there is no dashboard definition in the repository |
| Error tracking (Sentry) | ✅ **Real** | `@sentry/nestjs@11.1.0`; a no-op when `SENTRY_DSN` is unset |
| Backup strategy | ⛔ **Documented, not automated** | No job, no schedule, no PITR, no restore drill |
| Security audit | ✅ **CI only** | `npm audit --omit=dev` + `npm audit`. ⛔ No external penetration test |
| Load testing | ⛔ **Not built** | No k6 / Locust / autocannon / Artillery config anywhere |
| Password hashing | ✅ bcrypt 12 | — |
| MFA | ⛔ **Not built** | Zero matches for `mfa`/`totp` |
| Account lockout | ⛔ **Not built** | No attempt counter in `auth.service.ts` |
| Session timeout / "remember me" | ⛔ **Not built** | No session store at all |
| Permission audit trail | ⛔ **Not built** | Zero `audit` hits in `common/permissions/` and `common/guards/` |
| Read replicas | ⛔ **Not built** | One primary; no `DB_REPLICA_*` |
| Horizontal backend scaling | ⚠️ Safe in theory, no artifact | Stateless + Valkey-backed counters; ⛔ no `Dockerfile` |
| Per-module README | ⛔ **Does not exist** | Only `backend/src/modules/search/README.md` |
| CHANGELOG | ⛔ **Does not exist** | — |
| Cyclomatic complexity limit | ⛔ No lint rule | — |
| API docs coverage 100% | ⚠️ Partial | Zod DTOs are invisible to `class-validator` decorators |
| Uptime 99.9% | ⛔ Not applicable | Not deployed |

### What is genuinely satisfied

A short and real list:

- ✅ **Rate limiting** — 4 tiers, Valkey-backed, shared across instances, real 429 tests, fail-open by design
- ✅ **Cache-aside with tag invalidation**, plus **hit-rate metrics** at `GET /api/v1/metrics/cache`
- ✅ **Circuit breakers, retry with backoff, timeout, and fallback** — wired into the three external
  services that exist
- ✅ **Test depth** — 145 unit files / 3047 tests, 22 e2e files / 136 tests against a real cloned
  database, 340 frontend tests, 2 real-browser Playwright suites with axe-core WCAG checks
- ✅ **Backend coverage above its gate**; **frontend is the gap** — S 39.79 / B 35.90 / F 35.74 / L 40.22, which is the one measured number that got worse rather than better
- ✅ **Error tracking**, structured logging, and correlation IDs
- ✅ **The event schema registry and DLQ**, which shipped early
- ✅ **bcrypt at cost 12**, separate JWT secrets, refresh-token rotation with reuse detection
- ✅ **Fail-closed authorization** — `RolesGuard` + `PermissionsGuard` wired via `@Secured()`, unknown
  roles demoted to `reader`

---

## Related Documentation

- ADR-003: `adr/003-use-valkey-cache.md` — the *actual* ADR-003 (⚠️ not "Caching Strategy")
- ADR-004: `adr/004-use-event-emitter2.md` — the *actual* ADR-004 (⚠️ not "Monitoring and Observability")
- ⛔ There is **no ADR-007 on security architecture** and **no ADR-015 on monitoring**; the previous
  version cited both. The ADR set is four files: `001`–`004`
- Security architecture: `security-architecture/overview/security-architecture.md`
- Deployment: `deployment/deployment.md` — read its "Missing artifact" section first
- Backups: `deployment/backup.md`, `deployment/backup-strategy.md`
- Testing: `testing/testing-strategy.md`
- Read replicas (a proposal, not built): `system-architecture/infrastructure/read-replicas.md`

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| Per-phase checklist marking ✅ for response time, dashboards, backup strategy, and load testing | ⛔ **All four are false.** Replaced with a status-per-claim table plus a short "what is genuinely satisfied" list |
| 8 rate-limit rows (auth 5/IP, auth 10/user, public 50/IP, upload 10/user, search 50/IP, comments 30/user, webhooks unlimited) | ✅ Reality is **4 tiers**: 100/user, 10/IP, 5/user, 50/user. Comments have no tier; webhooks are not whitelisted |
| Resource quotas per user/tenant with 7 rows and a `QuotaExceededException` | ⛔ **No quota system exists.** Rate limits are not quotas |
| A `ThrottlerGuard` keyed `rate-limit:{key}:{endpoint}` | ⛔ No such guard and no per-endpoint key. Nest's guard + `ValkeyThrottlerStorage`, keyed per tier |
| Circuit breakers on 5 services at a 50% failure threshold | ⚠️ Wired on **3** (Sanity, Paymob, OAuth). Not on S3 or email. The threshold is an absolute count (`5`), not a rate |
| `DB_POOL_MIN/MAX/IDLE_TIMEOUT` and a 4-row per-environment pool table | ⛔ Read by nothing. One constant for all environments |
| 21 cache rows with hand-written key templates and a `cache.config.ts` | ⚠️ **3 real TTLs** (600/600/300 + 3600 default), tag-based invalidation, no config file |
| `session:{userId}` with a 7-day TTL | ⛔ **No session cache exists** |
| WAF block key `waf:block:{ip}` with a 5-minute TTL | ⚠️ A Valkey set; temp TTL 3600s, permanent has no TTL |
| "MFA support: TOTP (Google Authenticator)" | ⛔ **Not implemented.** Zero matches across backend, frontend, and packages |
| "Session timeout: 24 hours (remember me), 1 hour (default)" | ⛔ No session store, no timeout, no remember-me |
| "Login rate limits: 5 attempts per minute per IP" | ✅ Rate limiting exists, but at **10/min per IP** |
| "Password reset: 3 attempts per hour per email" | ⛔ Not implemented |
| "Encryption at rest: PostgreSQL TDE, Valkey encryption" | ⚠️ AES-256-GCM on two token columns only. TDE is not enabled |
| "Audit logging: all sensitive operations logged" | ⚠️ Winston + Sentry. ⛔ No permission-decision audit trail |
| "Backup frequency: daily full, hourly incremental" / "retention 30 days" | ⛔ **Nothing backs up automatically** |
| RPO 1 hour / RTO 4 hours | ⛔ Unachievable — nothing to restore from |
| "PostgreSQL: read replicas, 1 primary + 3 replicas" | ⛔ **Not built** |
| "Code coverage > 80% overall, 90% for critical modules" | ⚠️ Backend met (85.43 / 82.39 / 79.00 / 85.58); frontend not (39.79 / 35.90 / 35.74 / 40.22). The 90% tier was never a configured floor. **Retired in favour of the unified ≥ 80% roadmap target** |
| "Cyclomatic complexity < 10 per function" | ⛔ No such lint rule |
| "README: every module" | ⛔ Only `modules/search/README.md` exists |
| "Changelog: updated with every release" | ⛔ **No CHANGELOG in the repository** |
| "Related: ADR-007, ADR-015" | ⛔ Neither exists. The ADR set is `001`–`004` |
| `valkey.conf` maxmemory / allkeys-lru / save / eviction policy | ⛔ No `valkey.conf` in the repo; the container runs the image default. ⚠️ `allkeys-lru` would silently evict the token blacklist and rate-limit counters |
| Horizontal backend scaling to 10+ instances | ⚠️ The code is stateless and Valkey-backed, so it is safe — but ⛔ there is no deployment artifact to scale |

---

*This document defines the non-functional requirements for Hakawi. Requirements are targets; the
statuses above are measurements against the code as of 2026-09-30, and they are deliberately
unflattering where the system does not yet meet them.*
