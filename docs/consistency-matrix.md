# Consistency Matrix

## Hakawi Platform - Data Consistency Classification

This document defines the consistency model for each data type in the Hakawi platform, following
Principles #14 (AP as Default) and #16 (Smart Hybrid Consistency).

Reconciled against `backend/src/db/schema/*.ts` on 2026-09-30.

---

## Consistency Models

| Model | Description | Use Case |
|-------|-------------|----------|
| **Strong** | Reads always return the latest written value | Critical data where inconsistency causes financial loss or security breaches |
| **Eventual** | Reads may return stale data temporarily, but will converge | Non-critical data where availability is preferred |
| **Causal** | Related operations maintain order and causality | Threaded discussions, comments and replies |

---

## Data Classification Matrix

| Data Type | Consistency | Reason | Implementation |
|-----------|-------------|--------|----------------|
| **Users** | Strong | Authentication and authorization depend on accurate user data | PostgreSQL is the source; a tagged Valkey cache with immediate invalidation on write |
| **Auth Tokens** | Strong | Security-critical; revoked tokens must be rejected immediately | JWT (15m access / 7d refresh) + a Valkey refresh-token **blacklist** with a 7-day TTL |
| **Payments** | Strong | Financial accuracy is non-negotiable | PostgreSQL. ⛔ No pessimistic or optimistic locking is implemented — see the note below |
| **Inventory** | Strong | Stock accuracy prevents overselling | ⛔ **No inventory entity exists.** The nearest analogue is a book's `is_free` / price, which carries no stock count |
| **Stories** | Eventual | User-generated content; temporary inconsistency is acceptable | PostgreSQL primary, cache-aside at 600s with tagged invalidation |
| **Notifications** | Eventual | Non-critical; users tolerate slight delay | PostgreSQL primary, event-driven creation |
| **Messages** | Causal | Related messages must maintain order | PostgreSQL with timestamp ordering; `is_read` / `read_at` on the row |
| **Comments** | Causal | Replies must appear after parent comments | PostgreSQL with a self-referencing `parent_id` and `created_at` ordering |
| **Analytics** | Eventual | Derived data; eventual consistency is sufficient | Derived at read time by aggregation queries. No analytics store exists |

> ⚠️ **Payments and inventory are classified Strong by intent, not fully by mechanism.** `SELECT … FOR UPDATE` is implemented in `PaymentsRepository.reserveRefundCapacity()` and `reconcileRefundCapacity()` (`payments.repository.ts:270`) for refund capacity serialization under a row lock. **Not implemented** for the initial charge path — no row locking or version column on payment creation/completion. A concurrent double-submit of the same Paymob transaction is prevented by a `uniqueIndex` on `payments.paymob_transaction_id` — that is the *only* concurrency control on the charge path. Two users racing to buy the last copy of a paid book can both be charged. This is a real gap, not a documentation artefact.

---

## What Is Actually Implemented

The previous version of this document said only **Users** and **Auth Tokens** existed, because it
was written when only Phase 1 had shipped. That is no longer true. **22 backend modules and 33
tables are live**, and this is the full picture.

| Layer | Tables | Consistency | Notes |
|---|---|---|---|
| Identity | `users`, `user_restrictions` | Strong | `users` is cached with tagged invalidation; restrictions are read on every **authenticated** request by `RestrictionGuard`, which `secured.decorator.ts` composes into `@Secured`; `@Public()` routes are outside the chain by design |
| Auth state | — (Valkey only) | Strong | Refresh-token blacklist; ⛔ no session table |
| Content | `stories`, `categories`, `tags`, `story_tags` | Eventual | Cache-aside at 600s, tags `stories` |
| Books | `books`, `book_categories`, `book_tags`, `reading_progress` | Eventual | Cache-aside at 600s, tags `books` |
| Commerce | `rentals`, `rental_extensions`, `library` | Strong (per row) | ⛔ no cross-row locking |
| Payments | `payments`, `payment_transactions`, `refunds` | Strong | Cache 300s, tags `payments`; reads/writes forced to primary via `withPrimary()`/`dbPrimary` (ADR-007). `payment_status` enum includes `processing` (SSOT in shared-types, ADR-008). |
| Social | `follows`, `reactions`, `comments`, `comment_reactions` | Causal / Eventual | Event-driven; the cache is not the source of truth. `reactions` partitioned monthly (`reactions_p`, ADR-010). |
| Messaging | `conversations`, `messages`, `notifications`, `notification_preferences` | Causal | Socket.IO + Redis adapter for delivery; PostgreSQL for order. `messages` and `notifications` partitioned monthly (ADR-010). |
| Commerce transactions | `payment_transactions` | Strong | Partitioned monthly (`payment_transactions_p`, ADR-010). |
| Counters | `counters` | Eventual (cache) / Strong (via `withPrimary`) | Single Source of Truth for `view_count`/`like_count`/`comment_count`/`download_count`/`reply_count`. Main-table columns are read-only caches (ADR-011). |
| Contests | `contests`, `contest_submissions`, `contest_votes`, `contest_prizes` | Strong per contest | ⛔ no transaction across vote-count and winner selection |
| Gamification | `badges`, `user_badges` | Eventual | Awarded by event handler |
| Moderation | `reports`, `moderation_actions` | Strong | Admin dashboard reads live. `report_status` enum includes `escalated` (SSOT in shared-types, ADR-008). |
| Uploads | `uploads` | Eventual | S3 is the object store; PostgreSQL holds the row. Soft-deleted objects reclaimed by `cleanup-orphaned-uploads` (ADR-013). |
| Encrypted mirrors | `users.phone_encrypted`, `users.email_encrypted`, `payments.metadata_encrypted` | Strong | Column-level pgcrypto encryption; plaintext columns deprecated (ADR-012). Key set via `ALTER SYSTEM SET app.encryption_key`. |

---

## Consistency Guarantees

### Strong
- User data is written to PostgreSQL first; the Valkey cache is invalidated immediately on
  write/delete via `@CacheInvalidateTags`.
- A revoked refresh token is rejected on the next request (blacklist read is synchronous).
- Access restrictions take effect on the next request.

### Eventual
- Cached reads converge within their TTL: **600s** for stories and books, **300s** for payments,
  **3600s** by default (`DEFAULT_CACHE_TTL_SECONDS`).
- Story → Sanity sync is event-driven and asynchronous.
- Notification delivery is event-driven.

⚠️ **Cache TTLs are compile-time constants, not configuration.** `CACHE_TTL_*` environment
variables are documented in `backend/.env.example` but **read by nothing** — see
`docs/deployment/environment.md` → *Cache*. Changing a TTL means changing a constant and
redeploying.

### Causal
- Comments are ordered by `parent_id` + `created_at`; a reply cannot precede its parent because it
  references it.
- Messages are ordered by timestamp within a conversation.
- ⚠️ **Fixed defect, corrected here:** `GET /api/v1/comments/story/:storyId` used to read
  `eq(comments.parentId, null as unknown as string)`, which emits `parent_id = NULL` and is never
  true, so **top-level comments were never returned**
  (`backend/src/modules/comments/repositories/comments.repository.ts`). It now reads
  `isNull(comments.parentId)` at line 48, and the row query and the count query share one
  `visibleTopLevel` predicate so page and count cannot drift. Fixed in commit `01134dd`; pinned by
  `comments.repository.spec.ts:111` and `backend/test/comments.integration-spec.ts:50`
  (`total === 1`).
  **This document previously listed the bug as open. That was wrong — the causal ordering rule was
  never at fault, and there is no `it.fails` in this repository.** The residual ⚠️ is the one
  Principle #16 records as well: causal consistency here is a **schema property, not an enforced
  mechanism** — nothing rejects a write that violates the ordering.

---

## Operational Data Concerns

### Declarative Partitioning (ADR-010)
High-growth append-only tables are partitioned monthly by `created_at` onto `*_p` parents:
`messages_p`, `notifications_p`, `payment_transactions_p`, `reactions_p`. Legacy tables remain in
place (additive migration). Archiving functions `archive_*_before(ts)` detach old partitions into
standalone `*_archived_*` tables for cold storage (S3) or retention-based drop.

**Cutover status (implemented in code, pending DB execution):**
- Dual-write is active in all four repositories (messages, notifications, reactions,
  payments.createTransaction) — every write targets both legacy and `*_p` tables.
- Repository read paths have been switched to `*_p` tables via `dbPrimary.execute()` / `$client.query()`.
- `npm run db:backfill-partitions` — copies legacy data to `*_p` tables (idempotent).
- `npm run db:verify-cutover` — verifies row-count parity before cutover.
- `migrations/0039_partition_cutover.sql` — drops legacy tables after parity verified.
- These three steps require a live PostgreSQL instance and must be executed in order:
  backfill → verify → migration 0039.

### Counters — Single Source of Truth (ADR-011)
`counters` is the authoritative source for every counter
(`view_count`, `like_count`, `comment_count`, `download_count`, `reply_count`). The denormalized
columns on `stories`, `books` and `comments` are read-only caches refreshed from `counters` by a
backfill job. Exact-consistency reads use `counters` via `withPrimary()`.

### Column-Level Encryption (ADR-012)
`users.phone`, `users.email` and `payments.metadata` have `*_encrypted` bytea mirrors encrypted
with pgcrypto (`encrypt_sensitive` / `decrypt_sensitive`), keyed by
`current_setting('app.encryption_key', true)`. Plaintext columns are deprecated. The operator must
set `app.encryption_key` identically on every replica and node.

### Object Storage Lifecycle (ADR-013)
Soft-deleted uploads (`uploads.deleted_at` set) retain their S3 objects until reclaimed by
`cleanup-orphaned-uploads` (default 30-day retention, `--dry-run` supported). Reads from
`dbPrimary` for an accurate soft-deleted list.

---

## Logical Sharding Strategy (P3 — Future)

If the dataset outgrows a single PostgreSQL node, the recommended sharding key is **`user_id`**
(or `book_id` for book-centric workloads). Rationale:

- Most queries are user-scoped (`/users/:id/stories`, `/users/:id/books`,
  `/users/:id/notifications`, `/users/:id/payments`), so `user_id` sharding keeps the hot path
  on a single shard.
- Cross-shard queries (global feeds, search, admin dashboards) go through a scatter-gather
  router or the OLAP store.
- Globally unique indexes (e.g. `users.email`, `users.username`, `stories.slug`) require a
  shard-aware uniqueness service or a centralized coordination table.

Sharding is **not implemented** in this version. The partitioning layer (ADR-010) is the
intermediate step: it keeps individual tables small enough to delay sharding, and the monthly
partition boundaries align with future shard boundaries.

---

## Monitoring

| Signal | Status |
|---|---|
| **Cache hit rate** | ✅ **Live.** `GET /api/v1/metrics/cache` returns `{ hits, misses, hitRate, … }` from `CacheMetrics` (`backend/src/common/interceptors/cache.interceptor.ts:62-72`) |
| **Consistency-violation detection** | ⛔ **NOT BUILT.** No code compares a cache read against the database to detect divergence |
| **Replication lag monitoring** | ✅ **Built and active** — `db/router.ts` probes every replica via
  `pg_last_wal_replay_lag()` every 5s. Replicas exceeding `MAX_REPLICA_LAG_MS` (2s) or failing a
  health check are excluded from the read path until they recover. `checkReplicaHealth()` exposes
  per-replica health, lag, and usability. `checkDatabaseHealth()` includes replica usability for
  `/api/v1/metrics/degradation`. |
| **Enum drift detection (CI)** | ✅ **Built** — `npm run db:check-enums` (`backend/scripts/check-db-enums.ts`) compares
  every application-declared enum value in `@hakawi/shared-types` against `pg_enum` in the database
  and fails CI on any mismatch (ADR-008). Prevents the `incident 0034` class of `22P02` failures. |
| **Cache hit rate** | ✅ **Live.** `GET /api/v1/metrics/cache` returns `{ hits, misses, hitRate, … }` from `CacheMetrics` (`backend/src/common/interceptors/cache.interceptor.ts:62-72`) |
| **Consistency-violation detection** | ⛔ **NOT BUILT.** No code compares a cache read against the database to detect divergence |
| **Payment double-charge detection** | ⛔ **NOT BUILT.** The `uniqueIndex` on `paymob_transaction_id` prevents duplicate *rows*, not duplicate *charges* |
| **Event DLQ depth** | ⚠️ A DLQ exists (`dlq.service.ts`) but there is no metric or alert on its size |

### Metrics that exist in total
- `GET /api/v1/metrics` — the Prometheus text exposition body; the only route that returns one
- `GET /api/v1/metrics/cache` — cache hits, misses, hit rate (super-admin guarded)
- `GET /api/v1/metrics/degradation` — rate-limiter and WAF-blocklist fallback health (super-admin guarded)
- `X-RateLimit-*` and `X-Waf-*` response headers
- Structured Winston logs with correlation IDs
- Sentry for unhandled errors

The observability surface is **three routes**, and only one of them is a Prometheus endpoint.
`GET /api/v1/metrics` is public and unauthenticated and serves the exposition format
(`text/plain; version=0.0.4`) from `backend/src/common/observability/prometheus.controller.ts`. The
other two are JSON, both behind `JwtAuthGuard` + `RolesGuard` for the super-admin role
(`backend/src/common/observability/metrics.controller.ts:73,80`): `GET /api/v1/metrics/cache` (cache
hits, misses, hit rate) and `GET /api/v1/metrics/degradation` (rate-limiter and WAF-blocklist
fallback health, so a fail-open episode is alertable).

**Why the scrape route is public and the other two are not.** A scrape is an unauthenticated `GET`
from the collector with no bearer token, so a credential-gated scrape would be a scrape that never
happened. That is a deliberate trade, recorded in `prometheus.controller.ts`: the body discloses
traffic shape, process uptime and heap size, and deliberately contains nothing request-scoped —
the counter records the route TEMPLATE, not the URL (`common/interceptors/metrics.interceptor.ts`),
so its cardinality is bounded by the number of routes.

> **This section previously said "There is no Prometheus /metrics endpoint, no metrics registry and
> no exporter", and that was false.** The zero-dependency registry
> `backend/src/common/observability/prometheus-registry.ts` exists precisely because `prom-client`
> is not installed and cannot be (the npm registry is unreachable); the file's own header records
> that as the reason it is hand-written. The sample interval timer is
> `default-metrics.collector.ts`, the counter is recorded by the global `MetricsInterceptor`, all
> three are provided by `common.module.ts`, and `monitoring/prometheus/prometheus.yml` scrapes the
> path with `job_name: 'hakawi-backend'`. A claim of "no metrics" written from the absence of a
> dependency is a claim about a framework rather than about the code (Principle #4 — the problem
> and the fix both have to be written down where the next reader looks).

### What the exposition body actually contains

Six series, all verified against the registry declarations:

| Metric | Type | Labels | Recorded by |
| --- | --- | --- | --- |
| `http_requests_total` | counter | `method`, `route`, `status` | `common/interceptors/metrics.interceptor.ts` |
| `process_uptime_seconds` | gauge | — | `default-metrics.collector.ts` |
| `process_resident_memory_bytes` | gauge | — | `default-metrics.collector.ts` |
| `process_heap_used_bytes` | gauge | — | `default-metrics.collector.ts` |
| `process_heap_total_bytes` | gauge | — | `default-metrics.collector.ts` |
| `nodejs_eventloop_lag_seconds` | gauge | — | `default-metrics.collector.ts` (sampled every 5s) |

`http_requests_total` is the series that makes an error-rate alert possible at all, and it is the
one the app itself owns. Everything else in the rules file reads exporter series (`pg_*`,
`redis_*`, `node_*`) or the scrape target's `up`. In production the same path and port are scraped
through the Helm pod annotations (`prometheus.io/path: /api/v1/metrics`,
`prometheus.io/port: "3001"`), so a rule written for the dev stack is true in the other.

⚠️ **Alerting is defined, not deployed.** `monitoring/prometheus/rules/hakawi-alerts.yml` holds
**14 rules** across three groups — `hakawi-backend` (BackendDown, BackendHighErrorRate,
BackendEventLoopLagHigh, PostgreSQLDown, PostgreSQLConnectionsHigh, PostgreSQLReplicationLag,
ValkeyDown, ValkeyMemoryHigh, ValkeyHitRateLow), `hakawi-infrastructure` (HostCPUHigh,
HostMemoryHigh, HostDiskHigh, HostNetworkReceiveErrors) and `hakawi-deployment` (DeploymentStale) —
alongside `monitoring/prometheus/prometheus.yml`, `monitoring/alertmanager/alertmanager.yml` and the
Grafana dashboard `monitoring/grafana/dashboards/hakawi-overview.json`. ⛔ Nothing deploys them —
there is no cluster, so no rule is ever evaluated.

> **Why the count is 14 and not 20, and why the removed names are not listed here.** Seven rules
> were deleted because the series they named are not emitted by anything:
> `WAFHighViolationRate` (`waf_violations_total`), `WAFIPBlockedSurge` (`waf_blocked_ips_total`),
> `AuthFailureSpike` (`auth_failures_total`), `RateLimitExhausted` (`rate_limit_exceeded_total`),
> `PaymentFailureRateHigh` (`payments_failed_total`, `payments_total`), `EmailQueueBacklog`
> (`email_queue_size`) and `PaymentWebhookFailures` (`payments_webhook_failures_total`).
> `BackendHighLatency` was replaced by `BackendEventLoopLagHigh`, which reads a gauge the process
> really publishes. The rejected alternative was to keep them as documentation of intent — a rule
> on a series that is never created is not weak coverage, it is none, because the expression
> evaluates to empty and stays empty: the condition could be true for weeks with nothing to show,
> and the file reads as guarding paths it does not guard (Principle #15). The full rationale, with
> the grep that proves each series is absent, is the comment block at the top of the rules file
> itself, which is where it is true; this row only carries the count.

---

## References
- Principle #14: AP as the Default Choice
- Principle #16: Smart Hybrid Consistency
- Principle #9: Single Source of Truth (SSOT)
- Cache implementation: `docs/adr/003-use-valkey-cache.md`
- Consistency enforcement: `docs/01_ARCHITECTURE_PRINCIPLES.md` → Principles #9, #11, #14, #16

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| "Phase 1: only **Users** and **Auth Tokens** are implemented" | ⛔ Outdated. **22 backend modules and 33 tables are live**, across the 12 functional layers of the inventory above. Replaced with a full inventory |
| "Valkey cache with **immediate invalidation**" for Users and Stories | ✅ **Confirmed real** — the cache is tagged (`books`, `stories`, `payments`) and `@CacheInvalidateTags` fires on every write. The claim was right; the document understated how much depends on it |
| "Cache hit-rate monitoring (planned for Phase 7)" | ✅ **Live now**, at `GET /api/v1/metrics/cache` |
| "Consistency-violation detection (planned for Phase 7)" | ⛔ Still not built |
| "Replication lag monitoring for read replicas (planned for Phase 7)" | ⚠️ Still unused — the router and its health check exist (`checkDatabaseHealth`), but no module injects the router, so no reads are split to monitor |
| Payments "PostgreSQL with pessimistic locking (Phase 4+)" | ⛔ Phase 4 shipped; **no locking was implemented.** The only concurrency control is a unique index on `paymob_transaction_id` |
| Inventory "PostgreSQL with optimistic locking (Phase 4+)" | ⛔ No inventory entity and no locking exist |
| "Cache TTL ensures data converges within 5 minutes" | Measured: 600s stories/books, 300s payments, 3600s default — and **not configurable**, since no `CACHE_TTL_*` variable is read |
| "Messages: PostgreSQL with timestamp ordering" | ✅ Confirmed, plus a Socket.IO + Redis adapter for delivery |
| — | **Corrected:** the `parent_id = NULL` bug is **fixed** (`isNull` at `comments.repository.ts:48`, pinned by `comments.repository.spec.ts:111` and `backend/test/comments.integration-spec.ts`). This document previously recorded it as an open bug and, in the C4 and ERD copies, as pinned by an `it.fails` — there is no `it.fails` in this repository. The absence of payment double-charge detection is also recorded, and is still ⛔ |

---

*This document defines the consistency classification for Hakawi.*
