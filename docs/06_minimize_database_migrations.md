# Principle #6: Minimize Database Migrations

**Statement:**
I treat database migrations as high-risk operations that require careful planning, thorough testing, and peer review before execution. I design schemas to be flexible enough to minimize the need for future migrations, because every migration is a potential point of failure in production. A schema change that breaks data integrity is worse than a feature that ships late.

**Rationale:**
- Migrations are risky in production
- Data loss is irreversible
- Downtime for migrations is costly
- Schema flexibility reduces future migrations

**Enforcement:**
- All migrations reviewed by 2+ developers
- Migrations tested on production-like data
- Rollback strategy for every migration
- Schema designed for extensibility

**Strategies:**
- Use JSONB for flexible data
- Add nullable columns first, backfill, then make required
- Avoid breaking changes (rename, don't delete)
- Use UUIDs for forward-compatible references
