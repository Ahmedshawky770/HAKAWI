# Schema Overview
## Hakawi Data Architecture

Schema design principles, naming conventions, ID strategy, status-column typing, audit fields, and
module-level schema ownership for the Hakawi database.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

**Sources of truth, in order:**
1. `migrations/*.sql` — 18 numbered files that create the schema
2. `backend/src/db/schema/*.ts` — the Drizzle models, 1:1 with the SQL
3. `packages/shared-types/src/*.ts` — the TypeScript contract

Everything in this document was reconciled against those three on 2026-09-30.

---

## Schema Design Principles

### 1. UUID Primary Keys — ✅
All 33 tables use `uuid` primary keys. This provides global uniqueness, no ID enumeration, and safe
external references.

### 2. Timestamps — ⚠️ partial
| Column | Tables | Note |
|---|---|---|
| `created_at` | **31 of 33** | Missing on `contest_submissions`, `user_badges` |
| `updated_at` | **15 of 33** | Missing on `book_tags`, `comment_reactions`, `contest_prizes`, `contest_submissions`, `contest_votes`, `conversations`, `follows`, `messages`, `moderation_actions`, `notifications`, `payment_transactions`, `reactions`, `refunds`, `rental_extensions`, `story_tags`, `tags`, `user_badges`, `user_restrictions` |
| `deleted_at` | **7 of 33** | See below |

> **The previous claim — "every table includes `createdAt` / `updatedAt` / `deletedAt`" — is false.**
> Only 7 of 33 tables have `deleted_at`, and roughly half have `updated_at`. Join tables and
> append-only records (`follows`, `reactions`, `comment_reactions`, `contest_votes`, `tags`,
> `story_tags`, `book_tags`) legitimately need no `updated_at`; the rest is drift.

### 3. Soft Deletes — ⚠️ partial
`deleted_at` exists on exactly 7 tables: `users`, `stories`, `comments`, `uploads`, `books`,
`payments`, `rentals`.

> ⛔ **No purge job exists.** `deleted_at` is written and never swept. "Soft deletes are purged after
> 30 days" is a policy, not behaviour. Hard deletes *are* used elsewhere: `book_categories`,
> `book_tags`, `story_tags` and `contest_*` are physically removed by their `.down.sql` scripts.

### 4. JSONB for Flexibility
Used where the shape is genuinely open. Not a general substitute for columns.

### 5. Enums for Status — ⛔ REPLACED BY `varchar`

**There are zero `CREATE TYPE` statements in the entire migration chain.** Every status column is a
`varchar` with a length and a default, e.g.:

```ts
// backend/src/db/schema/users.schema.ts:20-21
accountType: varchar('account_type', { length: 20 }).notNull().default('reader'),
adminRole:   varchar('admin_role',   { length: 20 }),
```

The *validation* moved to TypeScript and the guards:
- `ACCOUNT_TYPES` / `ADMIN_ROLES` are `as const` arrays in
  `packages/shared-types/src/user.ts:4,16`, so a bad value is a compile error at the type level.
- `normalizeAccountType()` / `normalizeAdminRole()` coerce at runtime, mapping the legacy values
  `author` → `writer`, `moderator` → `content_moderator`, `finance` → `financial_officer`, and
  falling back to `reader` for anything unknown.

**Trade-off, stated plainly:** a `varchar` cannot enforce its own domain, so an out-of-range status
written by raw SQL or a future bug is not rejected by the database — it is normalised (or silently
demoted to `reader`) by the application. The nine `CREATE TYPE` blocks this document previously
prescribed would give database-level enforcement, and they were never created.

The values those enums were meant to carry, and where they actually live now:

| Documented enum | Documented values | Real storage | Enforced by |
|---|---|---|---|
| `user_status` | active, inactive, suspended, deleted, banned | ⛔ no such column | — |
| `account_type` | reader…admin | `users.account_type` varchar(20) | `ACCOUNT_TYPES` + `normalizeAccountType()` |
| `admin_role` | super_admin…verification_officer | `users.admin_role` varchar(20) | `ADMIN_ROLES` + `normalizeAdminRole()` |
| `story_status` | draft, pending, approved, published, rejected | `stories.status` varchar | story service state machine |
| `contest_status` | draft, published, active, voting, completed, cancelled | `contests.status` varchar | contest service state machine |
| `prize_type` | cash, badge, recognition, publication | `contest_prizes.type` varchar | prize service |
| `submission_status` | pending, approved, rejected, winner, runner_up | `contest_submissions.status` varchar | contest service |
| `rental_status` | active, expired, cancelled, pending | `rentals.status` varchar | rental service |
| `rental_duration` | one_day…three_months | ⛔ no enum. `rentals.duration_days` is an **integer** constrained by `@IsIn([1, 3, 7, 14, 30, 90])` in `RentBookDto` — the enumeration exists, but as a class-validator constraint on a number, not as a database type | `RentBookDto` |

> ⚠️ **Known bug.** `backend/src/modules/moderation/dto/report.dto.ts` status enums omit
> `escalated`, so `autoEscalateReports` can write a status that the API can neither set nor filter
> on. Pinned by a test.

---

## Naming Conventions — ✅ mostly as documented

### Tables
- ✅ Snake_case plural: `users`, `stories`, `books`, `conversations`
- ✅ Join tables: `{a}_{b}` — `story_tags`, `book_tags`, `book_categories`, `user_badges`,
  `contest_votes`, `rental_extensions`, `comment_reactions`
- ❌ No module prefix (`auth_users`, `story_comments`) is used anywhere. The earlier guidance
  suggested it; the real schema is unprefixed.

### Columns
- ✅ Snake_case: `user_id`, `created_at`, `is_verified`
- ✅ Boolean prefix: `is_`, `has_`
- ✅ Foreign keys: `{table_name}_id`

### Indexes
- ✅ Pattern: `{table}_{column}_idx` (`payments_paymob_payment_key_idx`,
  `user_restrictions_user_id_idx`)
- ✅ Drizzle-generated names are also present (`refunds_payment_id_idx`,
  `payment_transactions_payment_id_idx`)
- ⚠️ Constraints: no `{table}_{column}_fk` or `{table}_{column}_check` naming convention is
  followed. Foreign keys are declared inline in `references()` and inherit Drizzle's generated
  constraint names.

---

## ID Strategy

### Primary Keys
- Type: UUID v4
- Storage: `uuid` PostgreSQL type
- **Generation: application-side, `crypto.randomUUID()`** — declared as a Drizzle `$defaultFn`:
  ```ts
  // backend/src/db/schema/users.schema.ts:5-8
  id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  ```
- ⚠️ **The `gen_random_uuid()` database default this document previously documented does not exist.**
  `grep -rn "gen_random_uuid" backend/src/db/schema/` returns nothing, and the column default in the
  SQL is `uuid_generate_v4()` from the `uuid-ossp` extension — which is a *belt-and-braces*
  fallback, not the primary generator. The `uuid-ossp` extension is created by
  `0001_create_stories_tables.sql`, which is why that migration is deliberately irreversible.
- Consequence: an insert that bypasses Drizzle (raw SQL, `pg_dump` restore, a script) will not get a
  UUID from the application. Whether the database default covers it depends on the column DDL, not
  on the TypeScript model.

### Foreign Keys
- Type: UUID, matching the primary key type
- Nullable where the relationship is optional (e.g. `reports.reporter_id` is nullable since
  `0018` to allow auto-filed reports)

### Public IDs
Some entities carry non-UUID external identifiers: `sanity_story_id` on stories, Paymob identifiers
on payments (`paymob_order_id`, `paymob_payment_key`).

---

## Audit Fields

| Field | Status |
|---|---|
| `created_at` | ✅ on 31 of 33 tables |
| `updated_at` | ⚠️ on 15 of 33 tables |
| `deleted_at` | ⚠️ on 7 of 33 tables |
| `created_by` / `updated_by` | ⛔ **DO NOT EXIST.** No table has a `created_by` or `updated_by` column, and no `createdBy` / `updatedBy` field in any Drizzle model. Attribution is done through the separate `moderation_actions` and `payment_transactions` tables. |

---

## Module Schema Ownership — the 33 real tables

The previous version of this document listed **22 tables that do not exist** and **omitted 13 that
do**. Both errors are corrected below. The **Right column** shows what the old name was renamed to
or subsumed into.

### Auth
| Table | Note |
|---|---|
| `users` | ⛔ `external_auth_accounts` does not exist. OAuth linkages are `*_id` columns **on `users`** (`google_id`, `facebook_id`, `twitter_id`, `github_id`, `apple_id`, `tiktok_id`), `backend/src/db/schema/users.schema.ts:7-12` |
| — | ⛔ `user_refresh_tokens` does not exist. Refresh-token revocation is a Valkey key, not a table. |
| — | ⛔ `user_sessions` does not exist. There is no session store. |
| `users.password_reset_token` | AES-encrypted reset token (added by `0015`) |
| `users.email_verification_token` | AES-encrypted (added by `0006`) |

### Users
| Table | Note |
|---|---|
| `users` | Profile, `account_type`, `admin_role`, `is_verified`, `onboarding_completed`, `access_blocked` |
| — | ⛔ `user_profiles` does not exist; profile fields live on `users` |
| — | ⛔ `user_achievements` / `user_evolution` do not exist |
| — | ⛔ `user_verifications` does not exist; verification is a boolean + `user_verifications` handled by the verification service |

### Stories
| Table | Note |
|---|---|
| `stories` | |
| `categories` | |
| `tags` | |
| `story_tags` | ⛔ `story_categories` does not exist; the link table is `story_tags` (renamed) |
| — | ⛔ `story_views` does not exist. View counts are a `view_count` integer column on `stories`; `incrementViewCount()` updates the row (`backend/src/db/schema/stories.schema.ts:57`) |

### Books
| Table | Note |
|---|---|
| `books` | |
| `book_categories` | |
| `book_tags` | |
| `reading_progress` | **⛔ not in the old doc.** Added by `0008` |
| — | ⛔ `book_sales` does not exist; a sale is a `payments` row (`payments.metadata` carries `{"type":"purchase", …}`, `backend/src/db/schema/payments.schema.ts:24`) |
| `rentals` | ⛔ `book_rentals` → **renamed to `rentals`** |
| `rental_extensions` | |
| `library` | ⛔ `user_libraries` → **renamed to `library`** |
| — | ⛔ `book_reviews` does not exist |

### Contests
| Table | Note |
|---|---|
| `contests` | |
| `contest_submissions` | |
| `contest_votes` | |
| `contest_prizes` | **⛔ not in the old doc** (old name `prize_transactions`) |
| — | ⛔ `contest_badges` does not exist; a winner badge is a `user_badges` row |
| — | ⛔ `prize_transactions` does not exist; a prize is a `contest_prizes` row |

### Badges
| Table | Note |
|---|---|
| `badges` | **⛔ not in the old doc** |
| `user_badges` | **⛔ not in the old doc** (added by `0013`) |

### Interactions
| Table | Note |
|---|---|
| `follows` | |
| `reactions` | ⛔ `story_reactions` → **renamed to `reactions`** |
| `comments` | Self-referencing `parent_id`; thread depth is not bounded by a column |
| `comment_reactions` | |
| — | ⛔ `story_interactions` does not exist; it was a proposed aggregate, never built |

### Notifications
| Table | Note |
|---|---|
| `notifications` | |
| `notification_preferences` | |
| — | ⛔ `notification_groups` does not exist |

### Messages
| Table | Note |
|---|---|
| `conversations` | |
| `messages` | |
| — | ⛔ `message_read_receipts` does not exist. Read state is `is_read` / `read_at` on `messages` (`backend/src/db/schema/social.schema.ts:192-193`) |

### Moderation
| Table | Note |
|---|---|
| `reports` | |
| `moderation_actions` | ⛔ `moderation_logs` → **renamed to `moderation_actions`** |
| `user_restrictions` | |

### Payments
| Table | Note |
|---|---|
| `payments` | Includes `paymob_order_id`, `paymob_payment_key`, `paymob_iframe_url`, `paymob_accept_url` (added by `0016`) |
| `payment_transactions` | ⛔ `transactions` → **renamed to `payment_transactions`** |
| `refunds` | **⛔ not in the old doc** (added by `0009`) |
| — | ⛔ `withdrawals` does not exist; no author-withdrawal feature was built |

### Upload
| Table | Note |
|---|---|
| `uploads` | **⛔ not in the old doc** (created by `0004`) |

### Categories / Tags (standalone)
`categories` and `tags` are their own tables (listed under Stories above) and are not prefixed.

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality | Evidence |
|---|---|---|
| 9 `CREATE TYPE` enums | ⛔ **Zero `CREATE TYPE` statements.** All status columns are `varchar`, validated in TypeScript | `grep -c "CREATE TYPE" migrations/*.sql` → 0 |
| "Every table has `created_at`/`updated_at`/`deleted_at`" | `created_at` 31/33, `updated_at` 15/33, **`deleted_at` 7/33** | `backend/src/db/schema/*.ts` |
| `created_by` / `updated_by` optional audit fields | ⛔ No such column exists in any table | zero matches in `backend/src/db/schema/` |
| `gen_random_uuid()` as the ID generator | IDs are generated **application-side** via `crypto.randomUUID()` (`$defaultFn`); the DB default is `uuid_generate_v4()` from `uuid-ossp` | `backend/src/db/schema/users.schema.ts:5-7` |
| 22 documented tables | **22 of them do not exist.** 7 were renamed (`user_libraries`→`library`, `book_rentals`→`rentals`, `story_reactions`→`reactions`, `moderation_logs`→`moderation_actions`, `transactions`→`payment_transactions`, `story_categories`→`story_tags`, `prize_transactions`→`contest_prizes`); 3 were subsumed into columns on `users` (`external_auth_accounts` → `*_id` columns); 12 were never built | full table list from `migrations/*.sql` and `backend/src/db/schema/*.ts` |
| — | **13 real tables were missing from the doc:** `uploads`, `reading_progress`, `refunds`, `badges`, `user_badges`, `contest_prizes`, `rental_extensions`, `payment_transactions`, `book_categories`, `book_tags`, `conversations`, `messages`, `notification_preferences` | 33 tables total, SQL and Drizzle agree |
| Module-prefixed table names (`auth_users`, `story_comments`) | No table is prefixed | 33-table inventory |
| Soft deletes "preserves data for audit" | ⚠️ `deleted_at` on 7 tables and **never purged**; several tables are hard-deleted by their down scripts | no purge job in `backend/src` |
| `user_sessions` table | ⛔ No session store exists | `auth.service.ts` uses a Valkey blacklist only |
| `story_views` table | ⛔ Views are a column on `stories` | `stories.service.ts` `incrementViewCount()` |
| `user_verifications` table | ⛔ Verification is `users.is_verified` + the verification service | `services/user-verification.service.ts` |
| `withdrawals` table | ⛔ No withdrawal feature exists | — |

**Total real tables: 33.** Previously the document described 22 non-existent tables and omitted 13
real ones, for a net error of 35 entries.

---

*This document defines the schema design for Hakawi.*
