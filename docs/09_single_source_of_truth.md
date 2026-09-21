# Principle #9: Single Source of Truth (SSOT)

**Statement:**
Every piece of data in my system has exactly one authoritative source. No duplicated state, no conflicting caches, no ambiguity about which version is correct. If two systems disagree about the data, one of them is wrong — and I design so that there is only one place to look. SSOT is not a preference; it is a requirement for sanity.

**Rationale:**
- Data inconsistency causes bugs
- Duplicate state requires synchronization
- Synchronization is complex and error-prone
- Debugging inconsistent data is difficult

**Enforcement:**
- One authoritative source per entity
- Caches are invalidated on updates
- Event-driven updates for derived data
- No direct cross-module data access

**Examples:**
- User data: PostgreSQL only
- Story content: Sanity only
- User preferences: PostgreSQL only
- Analytics: Derived from primary sources
