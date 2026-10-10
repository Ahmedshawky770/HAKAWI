# Architecture Decision Records
## Hakawi - ADR Index

### ADR-001: Modular Monolith over Microservices
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Initial architecture decision for project structure.  
**Decision:** Use modular monolith with event-driven internal communication.  
**Rationale:** Faster development, simpler deployment, easier testing. Can extract to microservices later if needed.  
**Consequences:** Single deployment unit, shared database, simpler local development.

---

### ADR-002: PostgreSQL as Primary Database
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need for primary data store with strong consistency requirements.  
**Decision:** Use PostgreSQL 15+ with UUID primary keys and JSONB for flexible data.  
**Rationale:** ACID compliance, JSONB support, full-text search, mature ecosystem.  
**Consequences:** Strong consistency for critical data, eventual consistency for non-critical data.

---

### ADR-003: Drizzle ORM over Prisma/TypeORM
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need type-safe database access with migration support.  
**Decision:** Use Drizzle ORM with drizzle-kit for migrations.  
**Rationale:** Type-safe, lightweight, SQL-like syntax, excellent TypeScript support, zero runtime overhead.  
**Consequences:** Direct SQL control, type-safe queries, explicit migrations.

---

### ADR-004: JWT for Authentication
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need stateless authentication for API.  
**Decision:** Use JWT access tokens + refresh tokens stored in Valkey.  
**Rationale:** Stateless, scalable, supports OAuth integration, industry standard.  
**Consequences:** Token revocation requires Valkey blacklist, refresh token rotation needed.

---

### ADR-005: EventEmitter2 for Internal Event Bus
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need loose coupling between modules.  
**Decision:** Use EventEmitter2 for event-driven communication between modules.  
**Rationale:** Type-safe events, wildcard support, mature library, fits modular monolith pattern.  
**Consequences:** Modules communicate via events, easier to extract to microservices later.

---

### ADR-006: Vitest over Jest
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need modern test framework with good TypeScript support.  
**Decision:** Use Vitest for unit/integration tests, Playwright for E2E.  
**Rationale:** Faster, better TypeScript support, compatible with Jest API, ESM native.  
**Consequences:** Migration from Jest if team has existing Jest knowledge.

---

### ADR-007: Zod for Runtime Validation
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need runtime validation for environment variables and API inputs.  
**Decision:** Use Zod for all runtime validation.  
**Rationale:** TypeScript-first, excellent DX, composable schemas, tree-shakeable.  
**Consequences:** Single source of truth for validation, automatic TypeScript type inference.

---

### ADR-008: Valkey for Caching, Rate Limiting, and WAF State
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need a cache layer, a shared rate-limit counter store, and WAF block state.  
**Decision:** Use Valkey (Redis-compatible) as the single backing store for caching, rate limiting,
and WAF IP blocks, and for the refresh-token blacklist.  
**Rationale:** Redis-compatible, open source, fast, supports TTLs, sets, tags and atomic counters.  

**Consequences:**
- One cache layer serves several concerns, so Valkey availability is a hard dependency of the API.
  Per-IP throttling and IP blocking both key off it; the throttler **fails open** when it is
  unreachable, so a Valkey outage degrades protection rather than availability.
- Counters are **shared across instances**, so a per-tier limit is the real limit behind a load
  balancer. This was previously untrue: the in-memory-per-instance `ThrottlerStorage` made the
  effective limit `limit × instance_count`.
- ⛔ **Sessions are NOT stored in Valkey.** The original decision said "caching and sessions"; there
  is no session store anywhere. A session is a signed JWT pair, and the only server-side token state
  is the refresh-token blacklist key `refresh_token:blacklist:<token>` with a 7-day TTL.

**Status of the original claim:** the caching, rate-limiting and WAF-state parts of this ADR are
**actual**. The "sessions" part is **not built** — see
`docs/security-architecture/auth/auth-overview.md` → *Session Security*.

---

## Changelog — reconciliation (2026-09-30)

| Change | Note |
|---|---|
| ADR-008 "rate limiting … claimed" → **actual** | `ValkeyThrottlerStorage` (`backend/src/common/throttler/valkey-throttler.storage.ts`) now backs all four throttler tiers, with real 429 tests. This resolves the contradiction previously recorded at this line |
| ADR-008 "sessions" | Marked ⛔ not built. No session table, no session key in Valkey, no concurrent-session cap |
| ADR-008 title | "Caching and Sessions" → "Caching, Rate Limiting, and WAF State" to match what the code does |

---

*These ADRs document key architectural decisions for the Hakawi project.*
