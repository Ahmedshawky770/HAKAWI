# Consistency Matrix

## Hakawi Platform - Data Consistency Classification

This document defines the consistency model for each data type in the Hakawi platform, following Principles #14 (AP as Default) and #16 (Smart Hybrid Consistency).

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
| **Users** | Strong | Authentication and authorization depend on accurate user data | PostgreSQL single source, Valkey cache with immediate invalidation |
| **Auth Tokens** | Strong | Security-critical; invalid tokens must be rejected immediately | JWT with short expiry (15m), refresh tokens blacklisted in Valkey |
| **Payments** | Strong | Financial accuracy is non-negotiable | PostgreSQL with pessimistic locking (Phase 4+) |
| **Inventory** | Strong | Stock accuracy prevents overselling | PostgreSQL with optimistic locking (Phase 4+) |
| **Stories** | Eventual | User-generated content; temporary inconsistency is acceptable | PostgreSQL primary, cache with TTL |
| **Notifications** | Eventual | Non-critical; users can tolerate slight delay | PostgreSQL primary, cache with TTL |
| **Messages** | Causal | Related messages must maintain order | PostgreSQL with timestamp ordering |
| **Comments** | Causal | Replies must appear after parent comments | PostgreSQL with parent_id and created_at ordering |
| **Analytics** | Eventual | Derived data; eventual consistency is sufficient | Derived from primary sources, no direct writes |

---

## Phase 1 Implementation

For Phase 1 (Foundation), only the following data types are implemented:

| Data Type | Consistency | Implementation |
|-----------|-------------|----------------|
| **Users** | Strong | PostgreSQL + Valkey cache with invalidation |
| **Auth Tokens** | Strong | JWT + Valkey blacklist for refresh tokens |

---

## Consistency Guarantees

### Strong Consistency (Phase 1)
- User data is written to PostgreSQL first
- Valkey cache is updated immediately after write
- Cache is invalidated immediately on update/delete
- Reads always return consistent data

### Eventual Consistency (Phase 1)
- Not fully implemented in Phase 1
- Valkey cache provides eventual consistency for non-critical reads
- Cache TTL ensures data converges within 5 minutes

### Causal Consistency (Phase 1)
- Not implemented in Phase 1
- Will be implemented in Phase 3 for messages and comments

---

## Monitoring

- Cache hit rate monitoring (planned for Phase 7)
- Consistency violation detection (planned for Phase 7)
- Replication lag monitoring for read replicas (planned for Phase 7)

---

## References
- Principle #14: AP as the Default Choice
- Principle #16: Smart Hybrid Consistency
- Principle #9: Single Source of Truth (SSOT)
