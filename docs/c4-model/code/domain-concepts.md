# Domain Concepts
## Hakawi - Key Business Concepts

C4 **code-level** view: the business vocabulary, mapped onto the real tables, columns, and event
names.

Reconciled against `backend/src/db/schema/*.ts` and `backend/src/common/events/*.events.ts` on
2026-09-30.

> **Note:** These are business concepts with their real persistence mapped on. The previous version
> was conceptual only ("implementation may use different names or structures") and drifted from the
> schema on 12 points — all reconciled below.

Status markers: ✅ as described · ⚠️ partial / drifted · ⛔ does not exist.

---

## Purpose

A shared vocabulary for developers, product owners, and stakeholders, anchored to the 33 real tables
so the domain model and the database cannot silently diverge.

---

## Core Concepts

### User

**Definition:** anyone who interacts with the Hakawi platform. Table: **`users`**

**Types** (6) — `ACCOUNT_TYPES`, `packages/shared-types/src/user.ts:4`:
`reader` · `writer` · `rising_star` · `professional` · `publisher` · `admin`

✅ **Correct in the previous version.** The implication lattice (`ACCOUNT_TYPE_IMPLIES`) is real:
`rising_star` implies `writer` + `reader`; `admin` implies all six.

**Admin sub-roles** (4) — `ADMIN_ROLES`, `packages/shared-types/src/user.ts:16`:
`super_admin` · `content_moderator` · `financial_officer` · `verification_officer`

⚠️ Legacy DB values are normalised on read: `author` → `writer`, `moderator` →
`content_moderator`, `finance` → `financial_officer`. Anything unrecognised falls back to `reader`,
so an unknown role **loses** privilege.

**Key attributes → real columns:** `email` (unique), `username` (unique), `name`, `avatar`, `bio`,
`google_id`/`facebook_id`/`twitter_id`/`github_id`/`apple_id`/`tiktok_id`, `account_type`,
`admin_role`, `is_verified`, `onboarding_completed`, `access_blocked`, `password_hash`,
`password_reset_token` (AES-encrypted), `email_verification_token` (AES-encrypted),
`email_verified`, `created_at`, `updated_at`, `deleted_at`.

**Business rules — verified:**
- ✅ Username must be unique (`unique('users_username_unique')`)
- ✅ Email must be unique (`unique('users_email_unique')`)
- ⚠️ "A user cannot delete themselves" — ⛔ **the opposite is true.** `DELETE /users/me` is the
  self-delete route (`backend/src/modules/users/controllers/users.controller.ts:109`) and it **soft-deletes**. The `RestrictionGuard` /
  admin-side protection applies to *other* users' data
- ⚠️ "An admin cannot be downgraded directly" — ⛔ no such guard exists. `PATCH /users/:id` is
  super-admin only, but nothing prevents changing `account_type` to `reader`

### Story

**Definition:** a piece of content created by a writer. Table: **`stories`**

**States** — ⚠️ the previous version's `draft → pending → approved → published / rejected` is a
**designed** workflow. `stories.status` is a `varchar` and the service performs no state machine, so
the transitions are not enforced at any layer. The real column has no CHECK constraint.

**Key attributes → real columns:** `title`, `slug`, `excerpt`, `content`, `author_id` (FK → users),
`category_id` (FK → categories, **nullable**), `status`, `view_count`, `published_at`, `sanity_story_id`,
`created_at`, `updated_at`, `deleted_at`.

**Business rules:**
- ✅ A story must have an author (`author_id` NOT NULL)
- ⚠️ "Only the author can delete a story (archive, not hard delete)" — ✅ correct in intent:
  `IStoriesRepository.softDelete` is the only delete, and `archive()` is a separate route
- ✅ A story is in **at most one** category, not many — `category_id` is a single nullable FK
- ⛔ **"Word count must be accurate"** — ⛔ there is **no `word_count` or `reading_time` column**.
  The previous version listed both as key attributes; neither exists
- ⛔ **No `reaction_count` or `comment_count` column.** The real counters are `view_count` on
  `stories`, and `like_count` / `reply_count` on `comments`. `reactions` are counted by aggregation

### Book

**Definition:** a purchasable or rentable digital product. Table: **`books`**

**Key attributes → real columns:** `title`, `subtitle`, `author`, `cover_image`, `pdf_url`,
`pdf_file_key`, `price`, `is_free`, `status`, `created_at`, `updated_at`, `deleted_at`.

**Business rules:**
- ⚠️ "A book must have an owner" — ⛔ **there is no owner FK.** `books.author` is
  `varchar(255)`, not a `uuid` referencing `users.id`. Every other user reference in the schema is a
  UUID FK; this is the single exception, and it is a real integrity gap
- ✅ The owner cannot purchase their own book — `books.service.ts` checks before initiating
- ✅ Rental durations are constrained: `@IsIn([1, 3, 7, 14, 30, 90])` on `durationDays`
- ⚠️ "Rental cannot exceed maximum extensions" — ⛔ no `max_extensions` column exists. The
  `rental_extensions` table records the actual extensions; no ceiling is configured

### Contest

**Definition:** a competition for writers to submit stories. Table: **`contests`**

**States:** ⚠️ the previous version's `draft → published → active → voting → completed` is designed,
not enforced. The real routes are explicit lifecycle actions — `POST /contests/:id/start`, `/cancel`,
`/complete` — so the *transitions* are real even though `status` is an unconstrained `varchar`.

**Key attributes → real columns:** `title`, `description`, `theme`, `category_id` (FK, nullable),
`created_by` (FK → users), `start_date`, `end_date`, `submission_deadline`, `status`, `rules`,
`prize_description`, `created_at`, `updated_at`.

**Business rules:**
- ✅ A contest must have a publisher (`created_by` NOT NULL)
- ⚠️ "Submission deadline must be before contest end" — ⛔ **no validation enforces this.** No
  cross-column CHECK constraint exists
- ✅ One submission per user per contest — ⚠️ enforced only by application logic; there is no
  `uniqueIndex` on `contest_submissions(contestId, authorId)`
- ⚠️ "Winner must be from approved submissions" — ✅ handled by the service in
  `POST /contests/:id/winner`
- ✅ Contest children cascade: `contest_submissions`, `contest_votes`, and `contest_prizes` all carry
  `ON DELETE CASCADE` on their `contest_id` — the only real cascading in the schema apart from
  `user_badges`

### Notification

**Definition:** an in-app alert. Table: **`notifications`** (plus `notification_preferences`)

**Types:** the previous version's six categories (Social / Communication / Content / Account /
System / Contest) are a **presentation taxonomy**, not a stored enum. `notifications.type` is a
`varchar`; the actual emitted `notification.created` payloads determine the values.

**Key attributes → real columns:** `user_id` (FK, NOT NULL), `type`, `title`, `message`, `data` (JSONB),
`is_read`, `read_at`, `created_at`.

**Business rules:**
- ✅ A notification must have a recipient (`user_id` NOT NULL)
- ⛔ "A notification cannot be modified after creation" — **not enforced.** `PATCH /notifications/:id/read`
  mutates `is_read`
- ⛔ "Archived notifications are hidden from the inbox" — ⛔ **there is no `archived` column**
- ⚠️ "Type and priority" — ⛔ there is no `priority` column

### Message

**Definition:** a direct message between two users. Tables: **`conversations`**, **`messages`**

**Key attributes → real columns:**
- `conversations`: `participant1_id`, `participant2_id` (both FKs → users), `last_message_at`, `created_at`
- `messages`: `conversation_id` (FK), `sender_id` (FK), `content`, `is_read`, `read_at`, `created_at`

**Business rules:**
- ✅ "A conversation must have exactly 2 participants — no group chats" — **correct, and it is a
  schema constraint by design**: `conversations` is a two-column denormalisation. There is no
  `conversation_participants` join table, so group conversations are not representable
- ⚠️ "Participants cannot be the same user" — ⛔ no CHECK constraint enforces it
- ✅ Message sender cannot be null (`sender_id` NOT NULL)
- ⛔ "Only soft delete is allowed" — ⛔ `messages` has **no `deleted_at`** and no `DELETE` route

### Comment

**Definition:** a response to a story, or a reply to another comment. Table: **`comments`**

**Key attributes → real columns:** `story_id` (FK, NOT NULL), `author_id` (FK, NOT NULL),
`parent_id` (nullable **self-FK** to `comments.id`), `content`, `like_count`, `reply_count`,
`is_deleted`, `deleted_at`, `created_at`, `updated_at`.

**Business rules:**
- ✅ A comment must have an author and a story
- ✅ Nested comments are supported via the self-FK, using Drizzle's documented form
  `references((): AnyPgColumn => comments.id)` (`backend/src/db/schema/social.schema.ts:72`)
- ⚠️ **Thread depth is unbounded.** No column or CHECK constraint limits nesting
- ⚠️ "Only soft delete is allowed" — ✅ correct, and doubly represented: both `is_deleted` (boolean)
  and `deleted_at` (timestamp) exist
- ✅ **The query bug that used to break the self-FK is fixed.** `comments.repository.ts:45-48` used to
  read `eq(comments.parentId, null as unknown as string)`, which emits `parent_id = NULL` — never
  true — so **`GET /api/v1/comments/story/:storyId` returned zero top-level comments for every
  story.** It now uses `isNull(comments.parentId)`, and the row query and the count query share the
  one `visibleTopLevel` predicate so page and count cannot drift. Fixed in commit `01134dd`. The
  correct behaviour is pinned by `comments.repository.spec.ts:111` (asserts the `isNull` predicate)
  and by `backend/test/comments.integration-spec.ts:50` (asserts `total === 1`).
  **This document previously recorded the bug as open and claimed the pin was an `it.fails`. There
  is no `it.fails` anywhere in this repository — `grep -rn "it.fails" backend` returns 0 — and the
  fixed behaviour is pinned as fixed, not as a known failure.**

### Reaction

**Definition:** a user's response to a story or comment. Tables: **`reactions`**, **`comment_reactions`**

**Types** — ✅ **the previous version's six are correct**: Like, Love, Clap, Insightful, Funny, Sad.
`VALID_REACTION_TYPES` in `backend/src/modules/reactions/types.ts` is asserted against the shared
contract with `Exact<BackendReactionType, ReactionType> = true` — a compile-time drift check.

⚠️ `reactions.type` is a **`varchar`**, not a database enum, so the six values are enforced in
TypeScript only.

**Key attributes:** `user_id` (FK), `story_id` (FK) for `reactions`; `user_id` (FK), `comment_id` (FK)
for `comment_reactions`.

**Business rules:**
- ⚠️ "A user can only react once per target" — ⛔ **no unique index** on
  `reactions(user_id, story_id)` or `comment_reactions(user_id, comment_id)`. Application logic is the
  only guard
- ⛔ "Reaction is removed if the target is deleted" — ⛔ no FK cascade exists for `reactions` or
  `comment_reactions`
- ⚠️ The two tables are separate entities, not one polymorphic table — the previous version's "target
  (story or comment)" implies a single table

### Follow

**Definition:** a user's subscription to another user's content. Table: **`follows`**

**Key attributes → real columns:** `follower_id` (FK), `following_id` (FK), `created_at`.

**Business rules:**
- ⚠️ "A user cannot follow themselves" — ⛔ **no CHECK constraint**; application logic only
- ⛔ **"Follow is bidirectional (A follows B, B follows A)"** — ⚠️ confusingly worded and **not
  enforced**. A follow row is one-directional: `follower_id` follows `following_id`. The inverse is
  a separate row.
- ⛔ **"Notification enabled"** and "Notification preference is per follow relationship" — ⛔
  `follows` has **no** `notifications_enabled` column. Notification preferences are global per user
  per type, in `notification_preferences`

---

## Concept Relationships

```
User "1" ──── "*" Story        : authors         (stories.author_id)
User "1" ──── "*" Comment      : writes          (comments.author_id)
User "1" ──── "*" Reaction     : creates         (reactions.user_id)
User "1" ──── "*" Follow       : follows         (follows.follower_id / following_id)
User "1" ──── "*" Notification : receives        (notifications.user_id)
User "1" ──── "*" Message      : sends           (messages.sender_id)
User "1" ──── "*" Contest      : publishes       (contests.created_by)
User "1" ──── "*" Badge        : earns           (user_badges.user_id)

Story "1" ──── "*" Comment     : has             (comments.story_id)
Story "1" ──── "*" Reaction    : has             (reactions.story_id)
Story "0..1" ──── "*" Book     : becomes         (stories → books is NOT a real relationship)

Comment "1" ──── "*" Comment   : replies to      (comments.parent_id, self-FK)
Contest "1" ──── "*" Submission: has             (contest_submissions.contest_id)
Contest "1" ──── "*" Prize     : awards          (contest_prizes.contest_id)
Payment "1" ──── "*" Refund    : reverses        (refunds.payment_id)
```

⚠️ **"Story → Book : may become"** in the previous version is **not a relationship in the schema.**
There is no FK between `stories` and `books`. A book is authored independently; `books.author` is a
free-text `varchar`.

### ⛔ Relationships previously listed that do not exist
- Any relationship to `user_profiles`, `user_achievements`, `user_verifications`,
  `external_auth_accounts`, `user_sessions`, or `user_refresh_tokens` — **none of those tables exists**
- `Message → Conversation : belongs` was correct; `Notification → ArchivedNotification` was not

---

## Invariants — ⚠️ 4 of 7 verified, 3 unverified

| # | Invariant | Status |
|---|---|---|
| 1 | A story must have exactly one author | ✅ `stories.author_id` NOT NULL, FK → users |
| 2 | A book cannot be purchased by its owner | ✅ service-level check in `books.service.ts` |
| 3 | A user cannot follow themselves | ⚠️ Application logic only — ⛔ no CHECK constraint |
| 4 | A conversation must have exactly 2 participants | ✅ Structural: two columns, no join table |
| 5 | A notification must have a recipient | ✅ `notifications.user_id` NOT NULL, FK → users |
| 6 | A contest submission deadline must be before the contest end | ⛔ **Not enforced anywhere.** No CHECK constraint, no service validation found |
| 7 | Only soft deletes are allowed | ⚠️ **Partly false.** `deleted_at` exists on only **7 of 33** tables. `messages`, `reactions`, `comment_reactions`, `follows`, `notifications`, `conversations` and the contest tables have no `deleted_at`; and several tables *are* hard-deleted by their `.down.sql` rollback scripts |

---

## Domain Events — ✅ all 53, with the real names

The previous version used PascalCase class names (`UserRegistered`, `ContestEnded`, …). The real
event bus is **dotted lowercase strings**, emitted as
`emit('story.published', payload as StoryPublishedEvent)` and consumed via
`@OnEvent('story.published')`.

### The real event names, by module
| Module | Events |
|---|---|
| **User** | `user.registered`, `user.updated`, `user.followed`, `user.unfollowed`, `user.restricted`, `user.online`, `user.offline`, `user.typing` |
| **Auth** | `email.verification.requested`, `email.verified`, `password.reset.requested`, `password.reset.completed` |
| **Story** | `story.created`, `story.updated`, `story.published`, `story.archived`, `story.deleted`, `story.reacted`, `story.reaction.removed` |
| **Comment** | `comment.created`, `comment.updated`, `comment.deleted`, `comment.reacted`, `comment.reaction.removed` |
| **Book** | `book.created`, `book.updated`, `book.published`, `book.archived`, `book.deleted` |
| **Rental** | `rental.created`, `rental.extended`, `rental.returned`, `rental.expired` |
| **Library** | `library.item.added`, `library.item.accessed`, `library.item.removed` |
| **Payment** | `payment.created`, `payment.completed`, `payment.failed`, `refund.created`, `refund.completed` |
| **Contest** | `contest.created`, `contest.updated`, `contest.started`, `contest.cancelled`, `contest.completed`, `submission.submitted`, `submission.approved`, `submission.rejected`, `vote.cast`, `winner.selected`, `prize.distributed` |
| **Notification** | `notification.created` |
| **Message** | `message.sent`, `message.received`, `message.read` |

### ⛔ Events the previous version listed that do not exist
`UserVerified` · `UserBlocked` · `StoryDeleted` (as "archived" — the real names are separate:
`story.archived` and `story.deleted`) · `BookPurchased` · `BookRented` · `ContestEnded` ·
`NotificationRead` · `MessageRead` (as a distinct concept — the real name is `message.read`, emitted
on read)

### ✅ Also real, and previously undocumented
- The **event schema registry** (`common/events/event-schema-registry.ts`) — one registered Zod
  schema per event, validated by `event-validator.service.ts` before delivery
- The **dead letter queue** (`common/events/dlq.service.ts`) — an event whose handler throws is
  captured, not lost
- 10 event definition files and **72 `@OnEvent` handlers** under `modules/*/events/`

See `docs/module-boundaries/events/event-schema-registry.md`.

---

## Changelog — reconciliation (2026-09-30)

| Previous claim | Reality |
|---|---|
| Concept-only, "implementation may use different names" | Anchored to the real 33 tables, columns, and 55 event names |
| 6 account types, 4 admin roles | ✅ **Correct.** Added the implication lattice and the legacy-value normalisation (`author` → `writer`, etc.) |
| "A user cannot delete themselves" | ⛔ **False.** `DELETE /users/me` is the self-delete route and it soft-deletes |
| "An admin cannot be downgraded directly" | ⛔ No such guard exists |
| Story attributes include `word_count`, `reading_time`, `reaction_count`, `comment_count` | ⛔ **None exist.** Only `view_count` is a story counter; `like_count`/`reply_count` live on `comments` |
| Story states `draft → pending → approved → published` | ⚠️ Designed only. `status` is an unconstrained `varchar`; no state machine is enforced |
| `Story → Book : may become` | ⛔ **No FK exists** between `stories` and `books` |
| "A book must have an owner" | ⛔ `books.author` is `varchar(255)`, not a UUID FK — the schema's only non-FK user reference |
| "Rental cannot exceed maximum extensions" | ⛔ No `max_extensions` column or configured ceiling |
| 6 reaction types (Like, Love, Clap, Insightful, Funny, Sad) | ✅ **Correct** — and protected by an `Exact<>` compile-time assertion |
| "A user can only react once per target" | ⛔ No unique index on `(user_id, story_id)` or `(user_id, comment_id)` |
| "Reaction is removed if the target is deleted" | ⛔ No FK cascade on `reactions` / `comment_reactions` |
| "Follow is bidirectional" | ⚠️ Misleading — a follow row is one-directional; there is no inverse |
| `follows.notifications_enabled` / "per follow relationship" | ⛔ No such column. Preferences are per user, per type, in `notification_preferences` |
| Notification "archived" concept; `priority` attribute | ⛔ Neither exists |
| "A notification cannot be modified after creation" | ⛔ `PATCH /notifications/:id/read` mutates it |
| "A conversation must have exactly 2 participants" | ✅ **Correct** — structurally enforced by the two-column `conversations` table |
| "Participants cannot be the same user" | ⛔ No CHECK constraint |
| Message "Only soft delete is allowed" | ⛔ `messages` has no `deleted_at` and no DELETE route |
| Invariant 6: "submission deadline before contest end" | ⛔ **Not enforced anywhere** |
| Invariant 7: "Only soft deletes are allowed" | ⚠️ Partly false — `deleted_at` on 7 of 33 tables |
| PascalCase event names throughout | ✅ Real names are dotted lowercase strings, emitted via `emit()` + `@OnEvent()` |
| 8 events listed that do not exist | ⛔ `UserVerified`, `UserBlocked`, `BookPurchased`, `BookRented`, `ContestEnded`, `NotificationRead` |
| "StoryDeleted — story archived" | ⚠️ `story.archived` and `story.deleted` are two distinct events |
| Event registry "planned for Phase 7" | ✅ **Shipped early** — schema registry, validator, and DLQ |
| — | **Fixed:** the `comments.parentId` `eq(…, null)` bug that made top-level comments unreachable — `isNull()` at `comments.repository.ts:48`, pinned by `comments.repository.spec.ts:111` and `backend/test/comments.integration-spec.ts` |
| — | **New:** `books.author` being a `varchar` rather than a UUID FK, called out as a real integrity gap — **superseded by migration `0021_add_books_owner_id`**, which added `books.owner_id`; `assertOwnership` in `books.service.ts:445` now reads it |

---

*This document defines the domain concepts for Hakawi.*
