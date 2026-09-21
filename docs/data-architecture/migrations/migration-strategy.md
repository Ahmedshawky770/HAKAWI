# Migration Strategy
## Hakawi Data Architecture

This document defines how database schema changes are introduced, reviewed, tested, and applied in the Hakawi system.

---

## Migration Principles

### 1. Version Control
All migrations are version-controlled in the repository:
- Migrations stored in `backend/src/migrations/`
- Named with timestamp: `YYYYMMDDHHMMSS_description.ts`
- Never edit committed migrations
- Always create new migration for changes

### 2. Review Process
All migrations require:
- Code review by at least one other developer
- DBA approval for production
- Rollback plan documentation
- Impact assessment

### 3. Testing
Migrations must be tested:
- On development database
- On staging database (production-like)
- With production data snapshot
- Rollback tested

### 4. Zero-Downtime
Migrations must support zero-downtime deployment:
- Additive changes only (add columns, don't remove)
- Nullable columns first, backfill, then make required
- No table locks for extended periods
- Background jobs for data migration

---

## Migration Types

### Safe Migrations (No Review Required)
- Adding nullable columns
- Adding new tables
- Adding indexes
- Adding enum values

### Requires Review
- Adding non-nullable columns
- Modifying existing columns
- Removing columns
- Removing indexes
- Changing enum values

### Requires DBA Approval
- Dropping tables
- Dropping columns
- Large data migrations
- Schema changes affecting >100k rows

---

## Migration Workflow

### 1. Create Migration
```bash
npm run migration:create -- add_user_preferences
```

### 2. Edit Migration
```typescript
// migrations/YYYYMMDDHHMMSS_add_user_preferences.ts
import { sql } from 'drizzle-orm';

export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb
  `);
}

export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE users DROP COLUMN preferences
  `);
}
```

### 3. Test Migration
```bash
# Local
npm run migration:run

# Verify
npm run migration:verify

# Rollback test
npm run migration:rollback
```

### 4. Code Review
- Review migration SQL
- Verify rollback strategy
- Check for data loss risks

### 5. Deploy to Staging
```bash
npm run migration:run:staging
```

### 6. Verify on Staging
- Check data integrity
- Run application tests
- Verify performance

### 7. Deploy to Production
```bash
npm run migration:run:production
```

### 8. Post-Deployment
- Monitor for errors
- Verify data integrity
- Document any issues

---

## Rollback Strategies

### Additive Changes
- No rollback needed
- Safe to deploy

### Schema Changes
- Down migration provided
- Tested before deployment
- May require data backfill

### Data Migrations
- Two-phase approach:
  1. Add new column
  2. Backfill data
  3. Update application code
  4. Remove old column

---

## Emergency Procedures

### Migration Failure
1. Stop deployment pipeline
2. Assess data integrity
3. Run rollback migration
4. Restore from backup if needed
5. Investigate root cause
6. Document incident

### Production Issues
1. Enable maintenance mode
2. Run rollback migration
3. Verify application functionality
4. Disable maintenance mode
5. Post-mortem analysis

---

## Best Practices

1. **Small Migrations** - Keep migrations small and focused
2. **Backward Compatible** - Application works with both old and new schema
3. **Tested** - Always test on staging first
4. **Monitored** - Monitor migration performance
5. **Documented** - Document purpose and impact

---

*This document defines the migration strategy for Hakawi.*
