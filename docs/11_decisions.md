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

### ADR-008: Valkey for Caching and Sessions
**Status:** Accepted  
**Date:** 2026-09-20  
**Context:** Need caching layer and session storage.  
**Decision:** Use Valkey (Redis-compatible) for caching, sessions, rate limiting, and WAF state.  
**Rationale:** Redis-compatible, open source, excellent performance, supports all required patterns.  
**Consequences:** Single cache layer for multiple concerns, Valkey must be highly available.

---

*These ADRs document key architectural decisions for the Hakawi project.*
