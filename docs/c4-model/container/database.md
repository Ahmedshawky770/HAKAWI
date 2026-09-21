# Database Container
## Hakawi C4 - Container View

**Purpose:** Persist authoritative relational data.

**Technology:**
- PostgreSQL 15+
- Drizzle ORM
- UUID primary keys

**Responsibilities:**
- Users, stories, books, contests, interactions, notifications, messages, series, playlists, reports, payments
- Transactional integrity
- Auditability
- Enumerations and domain rules storage

**Deployment:** Managed Postgres or Docker
