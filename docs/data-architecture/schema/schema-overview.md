# Schema Overview
## Hakawi Data Architecture

This document defines the core schema design principles, naming conventions, ID strategy, enum placement, audit fields, and module-level schema ownership for the Hakawi database.

---

## Schema Design Principles

### 1. UUID Primary Keys
All tables use UUID v4 as primary keys. This provides:
- Global uniqueness
- No ID enumeration
- Safe for external references
- No sequence gaps

### 2. Timestamps
Every table includes:
- `createdAt` - Record creation timestamp
- `updatedAt` - Last update timestamp
- `deletedAt` - Soft delete timestamp (nullable)

### 3. Soft Deletes
No hard deletes in production. Use `deletedAt` timestamp:
- Preserves data for audit
- Allows data recovery
- Maintains referential integrity

### 4. JSONB for Flexibility
Use JSONB for metadata and flexible data:
- User preferences
- Story metadata
- Notification data
- Analytics data

### 5. Enums for Status
Use PostgreSQL enums for status fields:
- `user_status` - active, inactive, suspended, deleted, banned
- `story_status` - draft, pending, approved, published, rejected
- `contest_status` - draft, published, active, voting, completed, cancelled
- `rental_status` - active, expired, cancelled, pending

### 6. Indexing Strategy
Index on:
- All foreign keys
- Frequently queried fields (email, username, slug)
- Composite indexes for common queries
- Unique constraints for business rules

---

## Naming Conventions

### Tables
- Snake_case plural: `users`, `stories`, `book_sales`
- Prefix with module if needed: `auth_users`, `story_comments`

### Columns
- Snake_case: `user_id`, `created_at`, `is_verified`
- Boolean prefix: `is_`, `has_`
- Foreign keys: `{table_name}_id`

### Indexes
- Pattern: `{table}_{column}_idx`
- Unique: `{table}_{column}_unique_idx`
- Composite: `{table}_{columns}_idx`

### Constraints
- Foreign keys: `{table}_{column}_fk`
- Check constraints: `{table}_{column}_check`

---

## ID Strategy

### Primary Keys
- Type: UUID v4
- Storage: `uuid` PostgreSQL type
- Generation: `gen_random_uuid()` in database
- Format: `550e8400-e29b-41d4-a716-446655440000`

### Foreign Keys
- Type: UUID (matches primary key type)
- Storage: `uuid` PostgreSQL type
- Nullable: Yes, when relationship is optional

### Public IDs
- Some entities may have public IDs (e.g., `sanity_story_id`)
- These are strings, not UUIDs
- Used for external references

---

## Enum Definitions

### User Enums
```sql
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted', 'banned');
CREATE TYPE account_type AS ENUM ('reader', 'writer', 'rising_star', 'professional', 'publisher', 'admin');
CREATE TYPE admin_role AS ENUM ('super_admin', 'content_moderator', 'financial_officer', 'verification_officer');
```

### Story Enums
```sql
CREATE TYPE story_status AS ENUM ('draft', 'pending', 'approved', 'published', 'rejected');
```

### Contest Enums
```sql
CREATE TYPE contest_status AS ENUM ('draft', 'published', 'active', 'voting', 'completed', 'cancelled');
CREATE TYPE prize_type AS ENUM ('cash', 'badge', 'recognition', 'publication');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected', 'winner', 'runner_up');
```

### Rental Enums
```sql
CREATE TYPE rental_status AS ENUM ('active', 'expired', 'cancelled', 'pending');
CREATE TYPE rental_duration AS ENUM ('one_day', 'three_days', 'one_week', 'two_weeks', 'one_month', 'three_months');
```

---

## Audit Fields

Every table includes:
```sql
created_at TIMESTAMP NOT NULL DEFAULT NOW(),
updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
deleted_at TIMESTAMP NULL
```

Optional audit fields:
```sql
created_by UUID NULL REFERENCES users(id),
updated_by UUID NULL REFERENCES users(id)
```

---

## Module Schema Ownership

### Auth Module
- `users` - User accounts
- `external_auth_accounts` - OAuth linkages
- `user_refresh_tokens` - Refresh tokens
- `user_sessions` - Active sessions

### Users Module
- `user_profiles` - Extended profile data
- `user_achievements` - Gamification
- `user_evolution` - Progression tracking
- `user_verifications` - Verification documents

### Stories Module
- `stories` - Story metadata
- `story_categories` - Category definitions
- `story_tags` - Tag definitions
- `story_views` - View tracking

### Books Module
- `books` - Book metadata
- `book_sales` - Sales transactions
- `book_rentals` - Rental transactions
- `rental_extensions` - Rental extensions
- `user_libraries` - User book collections
- `book_reviews` - Book reviews

### Contests Module
- `contests` - Contest definitions
- `contest_submissions` - Contest entries
- `contest_votes` - Voting records
- `contest_badges` - Winner badges
- `prize_transactions` - Prize payments

### Interactions Module
- `follows` - User follows
- `story_reactions` - Story reactions
- `comments` - Comments
- `comment_reactions` - Comment reactions
- `story_interactions` - Interaction tracking

### Notifications Module
- `notifications` - Notification records
- `notification_preferences` - User preferences
- `notification_groups` - Grouped notifications

### Messages Module
- `conversations` - Conversation metadata
- `messages` - Message content
- `message_read_receipts` - Read status

### Moderation Module
- `reports` - Content reports
- `moderation_logs` - Moderation actions
- `user_restrictions` - User restrictions

### Payments Module
- `payments` - Payment records
- `transactions` - Financial transactions
- `withdrawals` - Author withdrawals

---

*This document defines the schema design for Hakawi.*
