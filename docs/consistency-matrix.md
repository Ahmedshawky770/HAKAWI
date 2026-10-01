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

> ⚠️ **Payments and inventory are classified Strong by intent, not by mechanism.** There is no
> `SELECT … FOR UPDATE`, no version column, and no optimistic-locking check anywhere in
> `backend/src`. A concurrent double-submit of the same Paymob transaction is prevented by a
> `uniqueIndex` on `payments.paymob_transaction_id` — that is the *only* concurrency control on the
> money path. Two users racing to buy the last copy of a paid book can both be charged. This is a
> real gap, not a documentation artefact.

---

## What Is Actually Implemented

The previous version of this document said only **Users** and **Auth Tokens** existed, because it
was written when only Phase 1 had shipped. That is no longer true. **21 backend modules and 33
tables are live**, and this is the full picture.

| Layer | Tables | Consistency | Notes |
|---|---|---|---|
| Identity | `users`, `user_restrictions` | Strong | `users` is cached with tagged invalidation; restrictions are read on every request by `RestrictionGuard` |
| Auth state | — (Valkey only) | Strong | Refresh-token blacklist; ⛔ no session table |
| Content | `stories`, `categories`, `tags`, `story_tags` | Eventual | Cache-aside at 600s, tags `stories` |
| Books | `books`, `book_categories`, `book_tags`, `reading_progress` | Eventual | Cache-aside at 600s, tags `books` |
| Commerce | `rentals`, `rental_extensions`, `library` | Strong (per row) | ⛔ no cross-row locking |
| Payments | `payments`, `payment_transactions`, `refunds` | Strong by intent | Cache 300s, tags `payments`; ⛔ no row locking |
| Social | `follows`, `reactions`, `comments`, `comment_reactions` | Causal / Eventual | Event-driven; the cache is not the source of truth |
| Messaging | `conversations`, `messages`, `notifications`, `notification_preferences` | Causal | Socket.IO + Redis adapter for delivery; PostgreSQL for order |
| Contests | `contests`, `contest_submissions`, `contest_votes`, `contest_prizes` | Strong per contest | ⛔ no transaction across vote-count and winner selection |
| Gamification | `badges`, `user_badges` | Eventual | Awarded by event handler |
| Moderation | `reports`, `moderation_actions` | Strong | Admin dashboard reads live |
| Uploads | `uploads` | Eventual | S3 is the object store; PostgreSQL holds the row |

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
- ⚠️ **Known bug:** `GET /api/v1/comments/story/:storyId` uses
  `eq(comments.parentId, null as unknown as string)`, which emits `parent_id = NULL` and is never
  true, so **top-level comments are never returned**
  (`backend/src/modules/comments/repositories/comments.repository.ts:45,52`). The causal ordering
  rule is correct in the schema; the query that would use it is wrong.

---

## Monitoring

| Signal | Status |
|---|---|
| **Cache hit rate** | ✅ **Live.** `GET /api/v1/metrics/cache` returns `{ hits, misses, hitRate, … }` from `CacheMetrics` (`backend/src/common/interceptors/cache.interceptor.ts:62-72`) |
| **Consistency-violation detection** | ⛔ **NOT BUILT.** No code compares a cache read against the database to detect divergence |
| **Replication lag monitoring** | ⛔ **NOT BUILT**, and not applicable — there are no read replicas |
| **Payment double-charge detection** | ⛔ **NOT BUILT.** The `uniqueIndex` on `paymob_transaction_id` prevents duplicate *rows*, not duplicate *charges* |
| **Event DLQ depth** | ⚠️ A DLQ exists (`dlq.service.ts`) but there is no metric or alert on its size |

### Metrics that exist in total
- `GET /api/v1/metrics/cache` — cache hits, misses, hit rate
- `X-RateLimit-*` and `X-Waf-*` response headers
- Structured Winston logs with correlation IDs
- Sentry for unhandled errors

There is **no Prometheus endpoint, no metrics registry, and no alerting rule** in the repository.

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
| "Phase 1: only **Users** and **Auth Tokens** are implemented" | ⛔ Outdated. **21 backend modules and 33 tables are live**, across 13 functional layers. Replaced with a full inventory |
| "Valkey cache with **immediate invalidation**" for Users and Stories | ✅ **Confirmed real** — the cache is tagged (`books`, `stories`, `payments`) and `@CacheInvalidateTags` fires on every write. The claim was right; the document understated how much depends on it |
| "Cache hit-rate monitoring (planned for Phase 7)" | ✅ **Live now**, at `GET /api/v1/metrics/cache` |
| "Consistency-violation detection (planned for Phase 7)" | ⛔ Still not built |
| "Replication lag monitoring for read replicas (planned for Phase 7)" | ⛔ Still not built — and there are no read replicas to monitor |
| Payments "PostgreSQL with pessimistic locking (Phase 4+)" | ⛔ Phase 4 shipped; **no locking was implemented.** The only concurrency control is a unique index on `paymob_transaction_id` |
| Inventory "PostgreSQL with optimistic locking (Phase 4+)" | ⛔ No inventory entity and no locking exist |
| "Cache TTL ensures data converges within 5 minutes" | Measured: 600s stories/books, 300s payments, 3600s default — and **not configurable**, since no `CACHE_TTL_*` variable is read |
| "Messages: PostgreSQL with timestamp ordering" | ✅ Confirmed, plus a Socket.IO + Redis adapter for delivery |
| — | **Newly recorded:** the `parent_id = NULL` bug that makes top-level comments unreachable, and the absence of payment double-charge detection |

---

*This document defines the consistency classification for Hakawi.*
