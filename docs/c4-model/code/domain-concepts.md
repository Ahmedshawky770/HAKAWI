# Domain Concepts
## Hakawi - Key Business Concepts

---

## Purpose

This document defines the core business concepts in the Hakawi system. It is intended to provide a shared understanding of the domain for developers, product owners, and stakeholders.

> **Note:** These are business concepts, not class diagrams. Actual implementation may use different names or structures.

---

## Core Concepts

### User

**Definition:** Anyone who interacts with the Hakawi platform.

**Types:**
- **Reader** — consumes published content
- **Writer** — creates and publishes stories
- **Rising Star** — emerging author with limited features
- **Professional** — full author features, book sales
- **Publisher** — creates and manages contests
- **Admin** — platform administration

**Key Attributes:**
- Identity (email, username, OAuth IDs)
- Account type and role
- Verification status
- Profile information

**Business Rules:**
- A user cannot delete themselves
- An admin cannot be downgraded directly
- Username must be unique
- Email must be unique

---

### Story

**Definition:** A piece of published content created by a writer.

**States:**
```
draft → pending → approved → published
              ↘ rejected
```

**Key Attributes:**
- Title, description, content
- Author (must be a Writer or higher)
- Category and tags
- Word count and reading time
- View count, reaction count, comment count

**Business Rules:**
- A story must have an author
- Published stories must have title and content
- Only the author can delete a story (archive, not hard delete)
- Word count must be accurate

---

### Book

**Definition:** A purchasable or rentable digital product owned by a writer.

**Key Attributes:**
- Title, subtitle, author name
- Cover image and PDF file
- Price
- Availability status

**Business Rules:**
- A book must have an owner
- The owner cannot purchase their own book
- Rental price must be positive
- Rental cannot exceed maximum extensions

---

### Contest

**Definition:** A competition created by a publisher for writers to submit stories.

**States:**
```
draft → published → active → voting → completed
              ↘ cancelled
```

**Key Attributes:**
- Title, description, theme, category
- Start date, end date, submission deadline
- Prize type and value
- Rules, minimum/maximum word count

**Business Rules:**
- A contest must have a publisher
- Submission deadline must be before contest end
- One submission per user per contest
- Winner must be from approved submissions

---

### Notification

**Definition:** An in-app alert sent to a user.

**Types:**
- **Social:** reaction, comment, follow, mention
- **Communication:** message
- **Content:** story publish, series update
- **Account:** verification, upgrade
- **System:** announcement, maintenance
- **Contest:** winner, new contest

**Key Attributes:**
- Recipient (must be a user)
- Type and priority
- Title and message
- Read/unread status

**Business Rules:**
- A notification must have a recipient
- A notification cannot be modified after creation
- Archived notifications are hidden from inbox

---

### Message

**Definition:** A direct message between two users.

**Key Attributes:**
- Sender (must be a user)
- Conversation (exactly 2 participants)
- Content
- Read status

**Business Rules:**
- A conversation must have exactly 2 participants
- Participants cannot be the same user
- Message sender cannot be null
- Only soft delete is allowed

---

### Comment

**Definition:** A response to a story or another comment.

**Key Attributes:**
- Author (must be a user)
- Target story or parent comment
- Content
- Like count, reply count

**Business Rules:**
- A comment must have an author
- A comment must belong to a story or another comment
- Nested comments are supported
- Only soft delete is allowed

---

### Reaction

**Definition:** A user's emotional response to a story or comment.

**Types:**
- Like, Love, Clap, Insightful, Funny, Sad

**Key Attributes:**
- User (who reacted)
- Target (story or comment)
- Reaction type

**Business Rules:**
- A user can only react once per target
- User can change their reaction type
- Reaction is removed if the target is deleted

---

### Follow

**Definition:** A user's subscription to another user's content.

**Key Attributes:**
- Follower (who follows)
- Following (who is followed)
- Notification enabled

**Business Rules:**
- A user cannot follow themselves
- Follow is bidirectional (A follows B, B follows A)
- Notification preference is per follow relationship

---

## Concept Relationships

```
User "1" ──── "*" Story : authors
User "1" ──── "*" Book : owns
User "1" ──── "*" Contest : publishes
User "1" ──── "*" Notification : receives
User "1" ──── "*" Message : sends
User "1" ──── "*" Comment : writes
User "1" ──── "*" Reaction : creates
User "1" ──── "*" Follow : follows

Story "1" ──── "*" Comment : has
Story "1" ──── "*" Reaction : has
Story "1" ──── "*" Book : may become

Contest "1" ──── "*" Submission : has
```

---

## Invariants

These are rules that must always be true in the system:

1. **A story must have exactly one author** — no orphan stories
2. **A book cannot be purchased by its owner** — no self-purchase
3. **A user cannot follow themselves** — no self-follow
4. **A conversation must have exactly 2 participants** — no group chats
5. **A notification must have a recipient** — no orphan notifications
6. **A contest submission deadline must be before the contest end** — logical ordering
7. **Only soft deletes are allowed** — no hard deletes in production

---

## Domain Events

These are significant occurrences in the system:

### User Events
- `UserRegistered` — new user joined
- `UserUpdated` — profile changed
- `UserVerified` — verification status changed
- `UserBlocked` — account blocked

### Story Events
- `StoryCreated` — new draft created
- `StoryUpdated` — content changed
- `StoryPublished` — story published
- `StoryDeleted` — story archived

### Book Events
- `BookCreated` — new book listed
- `BookPurchased` — book sold
- `BookRented` — book rented
- `RentalExtended` — rental extended

### Contest Events
- `ContestCreated` — new contest created
- `ContestStarted` — contest opened for submissions
- `ContestEnded` — contest closed
- `WinnerSelected` — winner announced

### Notification Events
- `NotificationCreated` — new notification sent
- `NotificationRead` — notification read

### Message Events
- `MessageSent` — new message sent
- `MessageRead` — message read

---

*This document defines the domain concepts for Hakawi.*
