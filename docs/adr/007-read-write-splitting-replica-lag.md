# ADR-007: Read/Write Splitting with Replica Lag Monitoring

## Status
Accepted

## Context
The Hakawi backend uses PostgreSQL as the primary store. The existing `db/router.ts`
implemented read/write splitting (`select()` → replica round-robin with primary
fallback; writes → primary), but it was not wired into any module: 26 files import
the plain `db` from `db/index.ts`, and no replica health or lag was monitored. This
meant reads could be served from a stale or unreachable replica without detection,
causing read-after-write inconsistencies for strong-consistency data (payments,
auth state, refunds).

## Decision
1. Router monitors every configured replica's health and replication lag via
   `pg_last_wal_replay_lag()` (Probe every `REPLICA_HEALTH_CHECK_INTERVAL_MS`).
2. Replicas that are unreachable or lagging beyond `MAX_REPLICA_LAG_MS` (2s) are
   excluded from the read path until they recover.
3. `withPrimary<T>(callback)` forces every operation inside the callback onto the
   primary database — used for payments, auth state changes, refunds, and any
   operation requiring read-after-write correctness.
4. `checkDatabaseHealth()` / `checkReplicaHealth()` expose per-replica health,
   lag, and usability for metrics (`/api/v1/metrics/degradation`) and dashboards.

## Consequences
- Strong-consistency data never reads from a lagging replica (Principle #16).
- Read scaling is preserved for eventual-consistency data (stories, books, social).
- Operational visibility into replica lag via `checkReplicaHealth()`.
- Applications must explicitly choose `withPrimary()` or `dbPrimary` for financial
  and security-critical reads; the default `db` remains read-split.

## References
- Principle #9 SSOT — `backend/src/db/router.ts` is the single routing decision point.
- Principle #16 Smart Hybrid Consistency — consistency model per data type.
- `backend/src/db/router.ts`
