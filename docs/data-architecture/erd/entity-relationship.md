# Entity Relationship Diagram
## Hakawi Data Architecture

This document contains entity-relationship overviews and key relationship rules across core tables in the Hakawi database.

---

## Core Entities and Relationships

### Users and Authentication

```
users (1) ──── (N) external_auth_accounts
users (1) ──── (N) user_refresh_tokens
users (1) ──── (N) user_sessions
users (1) ──── (N) user_profiles
users (1) ──── (N) user_achievements
users (1) ──── (N) user_verifications
```

**Relationships:**
- One user can have multiple external auth accounts (Google, Apple, etc.)
- One user can have multiple refresh tokens (for different devices)
- One user can have multiple active sessions
- One user has one profile (1:1)
- One user can have multiple achievements
- One user can have multiple verification requests

### Stories and Content

```
users (1) ──── (N) stories
stories (1) ──── (N) story_categories
stories (1) ──── (N) story_tags
stories (1) ──── (N) story_views
stories (1) ──── (N) story_interactions
```

**Relationships:**
- One user (author) can have many stories
- One story can have multiple categories (many-to-many)
- One story can have multiple tags (many-to-many)
- One story can have many views
- One story can have many interaction records

### Books and Commerce

```
users (1) ──── (N) books
books (1) ──── (N) book_sales
books (1) ──── (N) book_rentals
book_rentals (1) ──── (N) rental_extensions
users (1) ──── (N) user_libraries
books (1) ──── (N) book_reviews
```

**Relationships:**
- One user (owner) can have many books
- One book can have many sales
- One book can have many rentals
- One rental can have multiple extensions
- One user can have many books in their library
- One book can have many reviews

### Contests and Submissions

```
users (1) ──── (N) contests (as publisher)
users (1) ──── (N) contest_submissions (as author)
contests (1) ──── (N) contest_submissions
contest_submissions (1) ──── (N) contest_votes
contests (1) ──── (N) contest_badges
contests (1) ──── (N) prize_transactions
```

**Relationships:**
- One user (publisher) can create many contests
- One user (author) can submit to many contests
- One contest can have many submissions
- One submission can have many votes
- One contest can award many badges
- One contest can have many prize transactions

### Social Interactions

```
users (1) ──── (N) follows (as follower)
users (1) ──── (N) follows (as following)
stories (1) ──── (N) story_reactions
users (1) ──── (N) story_reactions
stories (1) ──── (N) comments
users (1) ──── (N) comments
comments (1) ──── (N) comment_reactions
users (1) ──── (N) comment_reactions
```

**Relationships:**
- One user can follow many users
- One user can be followed by many users
- One story can have many reactions
- One user can react to many stories
- One story can have many comments
- One user can write many comments
- One comment can have many reactions
- One user can react to many comments

### Notifications and Messages

```
users (1) ──── (N) notifications
users (1) ──── (N) notification_preferences
users (1) ──── (N) notification_groups
conversations (1) ──── (N) messages
users (1) ──── (N) messages (as sender)
users (1) ──── (N) conversations (as participant)
```

**Relationships:**
- One user can have many notifications
- One user has one notification preferences (1:1)
- One user can have many notification groups
- One conversation can have many messages
- One user can send many messages
- One user can participate in many conversations

### Moderation

```
users (1) ──── (N) reports (as reporter)
users (1) ──── (N) reports (as moderator)
stories (1) ──── (N) reports
comments (1) ──── (N) reports
users (1) ──── (N) reports (as target)
users (1) ──── (N) moderation_logs (as moderator)
users (1) ──── (N) user_restrictions
```

**Relationships:**
- One user can submit many reports
- One user (moderator) can handle many reports
- One story can have many reports
- One comment can have many reports
- One user can be target of many reports
- One user (moderator) can create many moderation logs
- One user can have many restrictions

---

## Key Relationship Rules

### One-to-One Relationships
- `users` ↔ `user_profiles` - Each user has exactly one profile
- `users` ↔ `notification_preferences` - Each user has one preferences record

### One-to-Many Relationships
- `users` → `stories` - One author, many stories
- `users` → `books` - One owner, many books
- `users` → `contests` - One publisher, many contests
- `stories` → `comments` - One story, many comments
- `stories` → `story_reactions` - One story, many reactions

### Many-to-Many Relationships
- `users` ↔ `stories` via `follows` - Users follow authors
- `stories` ↔ `categories` via `story_categories`
- `stories` ↔ `tags` via `story_tags`
- `users` ↔ `contests` via `contest_submissions`

### Self-Referencing Relationships
- `comments` → `comments` (parent-child) - Nested comments
- `users` → `users` via `follows` - User follows

---

## Cardinality Constraints

### Mandatory Relationships
- Story must have an author (users.id NOT NULL)
- Book must have an owner (users.id NOT NULL)
- Contest must have a publisher (users.id NOT NULL)
- Message must have a sender (users.id NOT NULL)
- Notification must have a recipient (users.id NOT NULL)

### Optional Relationships
- Story may or may not have a cover image
- User may or may not have a bio
- Book may or may not have a subtitle
- Comment may or may not have a parent (for replies)

### Cascading Deletes
- User deleted → cascade delete their stories, books, contests
- Story deleted → cascade delete comments, reactions
- Contest deleted → cascade delete submissions, votes

---

## Indexing Strategy

### Primary Keys
- All tables indexed by primary key (automatic)

### Foreign Keys
- All foreign keys indexed for join performance

### Unique Constraints
- `users.email` - Unique email
- `users.username` - Unique username
- `stories.slug` - Unique slug per author
- `conversations` - Unique participant pair

### Composite Indexes
- `stories (author_id, status, created_at)` - Author's stories by status
- `notifications (user_id, is_read, created_at)` - User's notifications
- `messages (conversation_id, created_at)` - Conversation messages

---

*This document defines the entity relationships for Hakawi.*
