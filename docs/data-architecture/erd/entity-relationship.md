# Entity Relationship Diagram
## Hakawi Data Architecture

Entity-relationship overviews and key relationship rules across the 33 tables in the Hakawi database.

Reconciled against `backend/src/db/schema/*.ts` and `migrations/*.sql` on 2026-09-30. Every
foreign key, index, and constraint below was extracted from the Drizzle models — not transcribed
from the previous version of this document, which described **22 tables that do not exist**.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

---

## Core Entities and Relationships

### Users and Authentication — ⛔ almost entirely wrong before

```
users (1) ──── (N) stories            author_id
users (1) ──── (N) books              author  ⚠️ varchar, NOT a foreign key
users (1) ──── (N) comments           author_id
users (1) ──── (N) reactions          user_id
users (1) ──── (N) comment_reactions  user_id
users (1) ──── (N) notifications      user_id
users (1) ──── (N) notification_preferences   user_id
users (1) ──── (N) messages           sender_id
users (1) ──── (N) conversations      participant1_id, participant2_id
users (1) ──── (N) payments           user_id
users (1) ──── (N) rentals            user_id
users (1) ──── (N) library            user_id
users (1) ──── (N) reading_progress   user_id
users (1) ──── (N) uploads            uploaded_by_id
users (1) ──── (N) reports            reporter_id  ⚠️ NULLABLE
users (1) ──── (N) moderation_actions report_id, admin_id, target_user_id
users (1) ──── (N) user_restrictions  user_id, created_by
users (1) ──── (N) user_badges        user_id, awarded_by
users (1) ──── (N) contests           created_by
users (1) ──── (N) contest_submissions author_id, reviewed_by
users (1) ──── (N) contest_votes      user_id
users (1) ──── (N) contest_prizes     winner_id
```

**⛔ Relationships the previous version documented that do not exist:**

| Documented | Reality |
|---|---|
| `users (1) ─ (N) external_auth_accounts` | ⛔ No such table. OAuth linkages are six `*_id` **columns on `users`**: `google_id`, `facebook_id`, `twitter_id`, `github_id`, `apple_id`, `tiktok_id` (`backend/src/db/schema/users.schema.ts:7-12`). It is 1:1 per provider, not 1:N |
| `users (1) ─ (N) user_refresh_tokens` | ⛔ No table. Refresh-token revocation is a Valkey key `refresh_token:blacklist:<token>` with a 7-day TTL |
| `users (1) ─ (N) user_sessions` | ⛔ No table and **no session store at all** — see `docs/security-architecture/auth/auth-overview.md` |
| `users (1) ─ (N) user_profiles` | ⛔ No table. Profile fields (`name`, `avatar`, `bio`, `username`) are columns on `users` |
| `users (1) ─ (N) user_achievements` | ⛔ Never built. The gamification entities that do exist are `badges` and `user_badges` |
| `users (1) ─ (N) user_verifications` | ⛔ No table. Verification is `users.is_verified` (boolean) plus `modules/users/services/user-verification.service.ts` |
| `users (1) ─ (N) follows` (as following) | ✅ Real, but **self-referencing via one table**: `follows.follower_id` and `follows.following_id` both reference `users.id` |

**⚠️ One integrity gap worth naming:** `books.author` is `varchar(255)`, **not** a `uuid` foreign key
(`backend/src/db/schema/books.schema.ts:32`). Every other user reference in the schema is a UUID FK.
A `books.author` value that is not a user id cannot be detected by the database, and joining books
to users requires a string comparison rather than an index-assisted UUID match. The column is
indexed (`books_author_idx`) but the type mismatch is real.

---

### Stories and Content

```
users     (1) ──── (N) stories       author_id      NOT NULL
categories(1) ──── (N) stories       category_id    nullable
stories   (1) ──── (N) comments      story_id       NOT NULL
stories   (1) ──── (N) reactions     story_id
stories   (1) ──── (N) uploads       story_id       nullable
stories   (N) ──── (N) categories    via story_tags
stories   (N) ──── (N) tags          via story_tags
```

| Documented | Reality |
|---|---|
| `stories (1) ─ (N) story_categories` | ⛔ No such table. `categories` links to `stories` **directly** via `stories.category_id` (nullable, so a story is in at most one category) |
| `stories (1) ─ (N) story_tags` | ✅ Real — a genuine many-to-many join table |
| `stories (1) ─ (N) story_views` | ⛔ No such table. Views are `stories.view_count` (integer, default 0, not null), incremented by `incrementViewCount()` |
| `stories (1) ─ (N) story_interactions` | ⛔ Never built. Interactions are three separate tables: `follows`, `reactions`, `comment_reactions` |

`categories` is **self-referencing** via `categories.parent_id` for sub-categories
(`backend/src/db/schema/stories.schema.ts:22`) — a real relationship the previous version omitted.

---

### Books and Commerce

```
users     (1) ──── (N) books             author  ⚠️ varchar, not a FK
categories(1) ──── (N) books             book_categories.id
books     (1) ──── (N) rentals           book_id
rentals   (1) ──── (N) rental_extensions rental_id
users     (1) ──── (N) library           user_id
books     (1) ──── (N) library           book_id
rentals   (1) ──── (N) library           rental_id  nullable
users     (1) ──── (N) reading_progress  user_id
books     (1) ──── (N) reading_progress  book_id
books     (N) ──── (N) tags              via book_tags
```

| Documented | Reality |
|---|---|
| `books (1) ─ (N) book_sales` | ⛔ No such table. A sale is a `payments` row; `payments.metadata` carries `{"type":"purchase","bookId":…}` (`backend/src/db/schema/payments.schema.ts:24`) |
| `books (1) ─ (N) book_rentals` | ⛔ Renamed → **`rentals`** |
| `users (1) ─ (N) user_libraries` | ⛔ Renamed → **`library`** (singular) |
| `books (1) ─ (N) book_reviews` | ⛔ Never built. There is no review entity anywhere in the schema |

**Documented but missing entirely:** `reading_progress`, `rental_extensions`, `book_categories`,
`book_tags` — all four exist and none was in the previous ERD.

---

### Contests, Prizes, and Badges

```
categories(1) ──── (N) contests            category_id  nullable
users     (1) ──── (N) contests            created_by
contests  (1) ──── (N) contest_submissions contest_id   ON DELETE CASCADE
stories   (1) ──── (N) contest_submissions story_id
users     (1) ──── (N) contest_submissions author_id, reviewed_by
contests  (1) ──── (N) contest_votes        contest_id   ON DELETE CASCADE
contest_submissions (1) ──── (N) contest_votes submission_id  ON DELETE CASCADE
contests  (1) ──── (N) contest_prizes       contest_id   ON DELETE CASCADE
contest_submissions (1) ──── (N) contest_prizes submission_id  ON DELETE CASCADE
users     (1) ──── (N) contest_prizes       winner_id
badges    (1) ──── (N) user_badges          badge_id     ON DELETE CASCADE
users     (1) ──── (N) user_badges          user_id      ON DELETE CASCADE
users     (1) ──── (N) user_badges          awarded_by
```

| Documented | Reality |
|---|---|
| `contests (1) ─ (N) contest_badges` | ⛔ No such table. A winner badge is a `user_badges` row; `badges` is a standalone catalogue |
| `contests (1) ─ (N) prize_transactions` | ⛔ Renamed → **`contest_prizes`** |
| — | **New:** `badges` and `user_badges` (migration `0013`) were entirely absent from the previous ERD |

✅ **Contest tables are the only ones with real `ON DELETE CASCADE`** — all five FKs in
`contests.schema.ts` and both in `badges.schema.ts`. Deleting a contest genuinely removes its
submissions, votes and prizes.

---

### Social Interactions

```
users  (1) ──── (N) follows             follower_id
users  (1) ──── (N) follows             following_id   ⛔ self-referencing via one table
stories(1) ──── (N) reactions           story_id
users  (1) ──── (N) reactions           user_id
stories(1) ──── (N) comments            story_id
users  (1) ──── (N) comments            author_id
comments(1) ─── (N) comment_reactions   comment_id
users  (1) ──── (N) comment_reactions   user_id
```

| Documented | Reality |
|---|---|
| `stories (1) ─ (N) story_reactions` | ⛔ Renamed → **`reactions`** |
| `comments (1) ─ (N) comments (parent-child)` | ✅ Real. `comments.parent_id` is a **nullable self-FK** using Drizzle's documented self-reference form: `references((): AnyPgColumn => comments.id)` (`backend/src/db/schema/social.schema.ts:72`). Thread depth is **not** bounded by any column or check constraint |
| — | **New:** `comments.is_deleted` (boolean) alongside `comments.deleted_at`, so soft-delete is doubly represented |

⚠️ **A real bug in the relationship the schema expresses.** The self-FK is correct, but the query
that should use it is wrong:
`comments.repository.ts:45,52` uses `eq(comments.parentId, null as unknown as string)`, which emits
`parent_id = NULL` — never true. `GET /api/v1/comments/story/:storyId` therefore returns **zero
top-level comments**. It should be `isNull()`. The pinned test is `it.fails`.

---

### Notifications and Messages

```
users        (1) ──── (N) notifications           user_id
users        (1) ──── (N) notification_preferences user_id
conversations(1) ──── (N) messages                 conversation_id
users        (1) ──── (N) messages                 sender_id
users        (1) ──── (N) conversations            participant1_id
users        (1) ──── (N) conversations            participant2_id
```

| Documented | Reality |
|---|---|
| `users (1) ─ (N) notification_groups` | ⛔ Never built. Notifications are flat, keyed by `type` |
| — | **New:** `conversations` is a **2-column denormalisation** — `participant1_id` + `participant2_id`, both UUID FKs to `users`. A user can be in many conversations, but a conversation can hold **exactly two** participants. There is no `conversation_participants` join table, so group conversations are not representable |
| — | **New:** read state is `messages.is_read` + `messages.read_at`, not a `message_read_receipts` table |

---

### Payments and Refunds — ⛔ absent from the previous ERD

```
users    (1) ──── (N) payments             user_id
payments (1) ──── (N) payment_transactions payment_id
payments (1) ──── (N) refunds              payment_id
```

| Documented | Reality |
|---|---|
| `transactions` | ⛔ Renamed → **`payment_transactions`** |
| `withdrawals` | ⛔ Never built. There is no author-withdrawal entity |
| — | **New:** `refunds` and `payment_transactions` were both absent from the previous ERD |

`payments.paymob_transaction_id` carries a **unique index**, which is the only concurrency control on
the money path. See `docs/consistency-matrix.md` → *Payments*.

---

### Moderation

```
users    (1) ──── (N) reports             reporter_id  ⚠️ NULLABLE since migration 0018
reports  (1) ──── (N) moderation_actions  report_id
users    (1) ──── (N) moderation_actions  admin_id, target_user_id
users    (1) ──── (N) user_restrictions   user_id, created_by
```

| Documented | Reality |
|---|---|
| `moderation_logs` | ⛔ Renamed → **`moderation_actions`** |
| `users (1) ─ (N) reports (as moderator)` | ⛔ **No such relationship.** A report has a `reporter_id`; there is no `moderator_id`. Moderation work is recorded in `moderation_actions.admin_id` |
| `stories (1) ─ (N) reports`, `comments (1) ─ (N) reports`, `users (1) ─ (N) reports (as target)` | ⛔ **None of these exist as foreign keys.** A report is **polymorphic**: `target_id` is a bare UUID and `target_type` is a `varchar` enum (`story`, `comment`, `user`). The database cannot enforce that `target_id` points at the table named by `target_type` |

That last point is the most consequential thing in this document: **`reports` has no referential
integrity on its target.** A report can point at a story that has been hard-deleted, and nothing in
the schema notices.

---

## Key Relationship Rules

### One-to-One
| Relationship | Reality |
|---|---|
| `users` ↔ `notification_preferences` | ✅ Real — `notification_preferences.user_id` is the sole owner column, indexed |
| `users` ↔ profile data | ✅ Real, but as **columns on `users`**, not a `user_profiles` table |
| `users` ↔ `is_verified` | ✅ Real, as a boolean column on `users` |

### One-to-Many
- ✅ `users` → `stories` (`author_id`)
- ✅ `users` → `comments` (`author_id`)
- ✅ `users` → `payments` (`user_id`)
- ✅ `users` → `rentals` (`user_id`)
- ✅ `contests` → `contest_submissions` / `contest_votes` / `contest_prizes`
- ✅ `payments` → `payment_transactions` / `refunds`
- ✅ `conversations` → `messages`

### Many-to-Many
| Relationship | Via | Reality |
|---|---|---|
| users ↔ stories (follows) | `follows` | ✅ Real. The follow is on **authors**, not on stories |
| stories ↔ categories | — | ⚠️ **Not many-to-many.** `stories.category_id` is a nullable single FK. The previous version claimed M2M via a `story_categories` table that does not exist |
| stories ↔ tags | `story_tags` | ✅ Real |
| books ↔ categories | `book_categories` | ✅ Real |
| books ↔ tags | `book_tags` | ✅ Real |
| users ↔ contests | `contest_submissions` | ✅ Real — a submission is the join |

### Self-Referencing
- ✅ `comments` → `comments` via `parent_id`, nullable, unbounded depth
- ✅ `categories` → `categories` via `parent_id` for sub-categories
- ✅ `users` → `users` via `follows` (`follower_id` / `following_id`)

---

## Cardinality Constraints

### Mandatory (`NOT NULL` foreign keys)
Verified against the Drizzle models:
- `stories.author_id`, `comments.story_id`, `comments.author_id`
- `messages.conversation_id`, `messages.sender_id`
- `conversations.participant1_id`, `conversations.participant2_id`
- `notifications.user_id`
- `payments.user_id`, `rentals.user_id`, `library.user_id`
- `contest_submissions.contest_id`, `.story_id`, `.author_id`
- `user_restrictions.user_id`, `user_restrictions.created_by`

### Optional (nullable foreign keys)
- `stories.category_id` — a story need not be categorised
- `comments.parent_id` — a top-level comment has no parent
- `uploads.story_id` — an upload need not be attached to a story
- `contest_submissions.reviewed_by` — set only once reviewed
- `library.rental_id` — a purchased book has no rental
- ⚠️ **`reports.reporter_id`** — nullable since migration `0018`, which allows `source='auto'`
  (system-filed) reports. An auto-filed report has no reporter at all, and the down script for
  `0018` is classified `data-loss` precisely because those rows cannot be represented once the
  `NOT NULL` constraint returns
- ⚠️ `books.author` is not a foreign key at all

---

## Cascading Deletes — ⚠️ only 2 of 33 tables

The previous version claimed "user deleted → cascade delete their stories, books, contests" and
"story deleted → cascade delete comments, reactions". **Neither is implemented.**

`onDelete: 'cascade'` appears in exactly **two** schema files:

| Table | Cascades on |
|---|---|
| `user_badges` | `user_id` → `users.id`, `badge_id` → `badges.id` (`badges.schema.ts:31,34`) |
| `contest_submissions`, `contest_votes`, `contest_prizes` | their `contest_id` and `submission_id` FKs (`contests.schema.ts:43,70,73,94,97`) |

Every other FK has **no `onDelete` clause**, which means PostgreSQL's default: `NO ACTION`. Deleting
a user row referenced by a story, comment, payment, or rental will be **rejected by the database**.

**The practical model is soft delete, not cascade:**
- `deleted_at` exists on only **7 of 33** tables: `users`, `stories`, `comments`, `uploads`,
  `books`, `payments`, `rentals`
- ⛔ **No purge job exists.** `deleted_at` is written and never swept, so "soft delete preserves data
  for audit" is true and "30-day purge" is a policy with no implementation
- Several tables *are* hard-deleted in practice: `book_categories`, `book_tags`, `story_tags`, and
  the contest tables are physically dropped by their `.down.sql` rollback scripts

---

## Indexing Strategy

### Primary Keys
✅ Every table's primary key is indexed automatically (33/33 `uuid` PKs).

### Foreign Keys
⚠️ **Most are indexed, but not all.** Indexed FK columns include `stories.author_id`,
`stories.category_id`, `comments.story_id`, `comments.author_id`, `comments.parent_id`,
`messages.conversation_id`, `messages.sender_id`, `conversations.participant1_id`,
`conversations.participant2_id`, `payments.user_id`, `payments.paymob_order_id`,
`payment_transactions.payment_id`, `refunds.payment_id`, `notifications.user_id`, `uploads.story_id`,
`contest_votes.contest_id`, `book_tags.book_id`, `book_tags.tag_id`, `story_tags.story_id`,
`story_tags.tag_id`, `reading_progress.user_id`, `reading_progress.book_id`, `rental_extensions.rental_id`.

Not indexed, and worth noting: `moderation_actions.report_id`, `moderation_actions.target_user_id`,
`user_restrictions.user_id`, `library.user_id`, `user_badges.badge_id`, `contest_prizes.contest_id`.

### Unique Constraints
| Constraint | Type | Reality |
|---|---|---|
| `users.email` | `unique('users_email_unique')` | ✅ Real |
| `users.username` | `unique('users_username_unique')` | ✅ Real |
| `user_badges (user_id, badge_id)` | `uniqueIndex('user_badges_unique_idx')` | ✅ Real — one award of a badge per user |
| `contest_votes (contest_id, submission_id, user_id)` | `uniqueIndex('contest_votes_unique_idx')` | ✅ Real — one vote per user per submission |
| `payments.paymob_transaction_id` | `uniqueIndex('payments_transaction_id_idx')` | ✅ Real — **the webhook idempotency guarantee** |
| `stories.slug` | `index('stories_slug_idx')` | ⚠️ **NOT unique.** The name ends in `_idx`, not `_unique_idx`, and it is a plain `index()`. The previous version claimed "unique slug per author" — a slug collision is possible at the database level |
| `categories.slug` | `index('categories_slug_idx')` | ⚠️ Same — not unique |
| `tags.slug` | `index('tags_slug_idx')` | ⚠️ Same — not unique |
| `conversations (participant1_id, participant2_id)` | `index('conversations_unique_idx')` | ⚠️ **Misleading name.** It is a plain `index()`, not a `uniqueIndex()`. The previous version's "unique participant pair" claim is **false**; two duplicate conversations between the same pair can be created |

### Composite Indexes — actual list
| Index | Columns | Purpose |
|---|---|---|
| `conversations_unique_idx` | `participant1_id, participant2_id` | Participant lookup (not unique) |
| `notifications_read_idx` | `user_id, is_read` | Unread notification badge |
| `user_badges_unique_idx` | `user_id, badge_id` | UNIQUE — one award per user per badge |
| `contest_votes_unique_idx` | `contest_id, submission_id, user_id` | UNIQUE — one vote per user per submission |

⛔ **Composite indexes the previous version documented that do not exist:**
- `stories (author_id, status, created_at)` — three **separate single-column** indexes exist
  (`stories_author_id_idx`, `stories_status_idx`, and no composite at all)
- `notifications (user_id, is_read, created_at)` — the real one is `(user_id, is_read)`, no
  `created_at`
- `messages (conversation_id, created_at)` — two separate single-column indexes

### Search indexes
Migration `0014_create_search_indexes.sql` adds three **GIN expression indexes** for PostgreSQL
full-text search. Their rollback is classified `reversible` — the only migration in the chain that
is.

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| 22 entities across 7 groups | **33 tables** across 10 groups. The previous ERD omitted `uploads`, `reading_progress`, `refunds`, `badges`, `user_badges`, `contest_prizes`, `rental_extensions`, `payment_transactions`, `book_categories`, `book_tags` |
| `external_auth_accounts`, `user_refresh_tokens`, `user_sessions`, `user_profiles`, `user_achievements`, `user_verifications` | ⛔ **None exist.** OAuth links are 6 columns on `users`; tokens and sessions are a Valkey blacklist; profile and verification are columns |
| `book_sales`, `book_reviews`, `user_libraries`, `book_rentals`, `story_views`, `story_categories`, `story_interactions`, `notification_groups`, `contest_badges`, `prize_transactions`, `transactions`, `withdrawals`, `moderation_logs` | ⛔ **None exist.** 4 were renamed (`library`, `rentals`, `reactions`, `moderation_actions`, `payment_transactions`, `contest_prizes`, `story_tags`); the rest were never built |
| "One story can have multiple categories (many-to-many)" | ⚠️ **False.** `stories.category_id` is a single nullable FK. Only *tags* are many-to-many |
| "Cascading deletes: user → stories, books, contests; story → comments, reactions" | ⚠️ **False.** `onDelete: 'cascade'` exists only on `user_badges` and the three contest child tables. Everything else is `NO ACTION` |
| "`stories.slug` unique per author" | ⚠️ `stories_slug_idx` is a plain index, not unique |
| "`conversations` — unique participant pair" | ⚠️ `conversations_unique_idx` is a plain index despite the name |
| Composite indexes on `stories`, `notifications (…, created_at)`, `messages (conversation_id, created_at)` | ⛔ None exist. The real composite indexes are listed above |
| "All foreign keys indexed for join performance" | ⚠️ Most are; a specific short list is not |
| `comments → comments` self-reference | ✅ Confirmed real — but the **query** using it is broken (`eq(parentId, null)` instead of `isNull()`), so top-level comments are never returned |
| Reports as relationships to `stories` / `comments` / `users` | ⛔ **Not foreign keys.** `reports` is polymorphic via `target_id` + `target_type` with **no referential integrity** |
| — | **New:** `books.author` is a `varchar(255)`, not a UUID FK — the only user reference in the schema that is not a foreign key |
| — | **New:** `categories.parent_id` self-reference (sub-categories) was missing |
| — | **New:** the payments/refunds ERD group did not exist |
| — | **New:** `reports.reporter_id` is nullable since `0018`, enabling auto-filed reports |

---

*This document defines the entity relationships for Hakawi.*
