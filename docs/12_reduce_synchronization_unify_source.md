# Principle #12: Reduce Synchronization, Unify Source, Prevent Cascade Failures

**Statement:**
I minimize the number of synchronized data sources in my systems. Every additional synchronization point is a potential point of failure and a source of inconsistency. By unifying the data source and reducing dependencies between components, I prevent cascade failures where one broken service drags the entire system down. Fewer moving parts means fewer things that can break.

**Rationale:**
- Synchronization is complex and error-prone
- More sync points = more failure points
- Cascade failures are catastrophic
- Single source of truth is simpler

**Enforcement:**
- Minimal sync between systems
- One authoritative source per entity
- Event-driven updates for derived data
- Circuit breakers for external dependencies

**Examples:**
- Users: PostgreSQL only (no sync to Sanity)
- Stories: Sanity only (read-only mirror in PostgreSQL)
- Notifications: PostgreSQL only
- Analytics: Derived from primary sources
