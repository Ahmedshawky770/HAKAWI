# Module Boundaries
## Hakawi - Module Responsibilities and Contracts

---

## Purpose

This document defines the responsibility boundaries between Hakawi modules. It is intended for new joiners and for maintaining clean module boundaries during development.

> **Note:** This reflects the intended module structure. Actual implementation may evolve.

---

## Module Organization

Hakawi follows a **modular monolith** architecture. Each business domain is encapsulated in its own module. Modules communicate through well-defined interfaces and events.

---

## Modules Overview

### Core Modules

#### Auth Module
**Responsibility:** Authentication, authorization, session management, and permission enforcement.

**Key Responsibilities:**
- User registration and login
- OAuth provider integration
- JWT token management
- Session creation and revocation
- Permission checks

**Depends On:**
- **None** — Auth is a foundational module
- Cache (session storage)
- Event Bus (auth events)

**Depends On Users Module:**
- Auth module accesses Users Module **only through the Users Repository interface**, not the Users Service
- This is a **read-only dependency** for user lookup during authentication
- No circular dependency: Auth does NOT call Users Service methods, and Users does NOT call Auth Service methods

**Events Published:**
- `user.registered`
- `user.logged_in`
- `user.logged_out`

**Events Consumed:**
- None

**Dependency Resolution:**
- Auth module uses `UsersRepository` interface (database read) for user lookup during login/registration
- Users module listens to `user.registered` event to initialize user profile data
- Communication is **one-directional**: Auth → Users (via event), Users → Auth (none)

---

#### Users Module
**Responsibility:** User lifecycle, profiles, stats, verification, and account data.

**Key Responsibilities:**
- User profile CRUD
- User statistics
- Verification workflow
- Account type management

**Depends On:**
- **None** — Users module does NOT depend on Auth module
- Cache (profile cache)
- Event Bus (user events)

**Relationship with Auth:**
- Users module **listens** to `user.registered` event from Auth module
- Users module **does NOT call** Auth module directly
- Auth module **does NOT call** Users Service (only Users Repository for read-only lookups)

**Events Published:**
- `user.updated`
- `user.verified`

**Events Consumed:**
- `user.registered` → sends welcome notification, initializes user stats

---

### Content Modules

#### Stories Module
**Responsibility:** Story CRUD, publishing workflow, search indexing, and Sanity synchronization.

**Key Responsibilities:**
- Story creation and editing
- Publishing workflow (draft → pending → approved → published)
- Sanity CMS synchronization
- Search indexing
- View tracking

**Depends On:**
- Users Module (author)
- Sanity CMS (content source)
- Search Module (indexing)
- Notifications Module (notify followers)

**Events Published:**
- `story.created`
- `story.updated`
- `story.published`
- `story.deleted`

---

#### Search Module
**Responsibility:** Full-text search across stories, authors, and categories.

**Key Responsibilities:**
- Index stories on publish
- Search queries with pagination
- Category and tag filtering

**Depends On:**
- Stories Module (content)
- Users Module (author data)

---

### Social Modules

#### Notifications Module
**Responsibility:** In-app notifications, preferences, and delivery.

**Key Responsibilities:**
- Notification creation
- Notification preferences
- Read/unread tracking
- Notification grouping

**Depends On:**
- Users Module (recipients)
- Cache (notification cache)
- Event Bus (notification events)

**Events Consumed:**
- `story.published` → notify followers
- `user.followed` → notify user
- `comment.created` → notify author

---

#### Messages Module
**Responsibility:** Direct messaging between users.

**Key Responsibilities:**
- Conversation management
- Message sending and history
- Read receipts
- Soft delete

**Depends On:**
- Users Module (participants)
- Notifications Module (new message alerts)

**Events Published:**
- `message.sent`
- `message.read`

---

### Business Modules

#### Books Module
**Responsibility:** Book sales, rentals, and user library.

**Key Responsibilities:**
- Book CRUD operations
- PDF upload and management
- Sales processing
- Rental management with extensions
- User library tracking

**Depends On:**
- Users Module (owner, buyer, renter)
- Payments Module (transactions)
- Notifications Module (purchase confirmations)

**Events Published:**
- `book.created`
- `book.purchased`
- `book.rented`

**Events Consumed:**
- `payment.completed` → grant access

---

#### Contests Module
**Responsibility:** Contest management, submissions, voting, and prize distribution.

**Key Responsibilities:**
- Contest creation and lifecycle
- Submission management
- Community voting
- Winner selection
- Prize distribution

**Depends On:**
- Users Module (publisher, participants)
- Stories Module (submissions)
- Payments Module (prizes)
- Notifications Module (contest updates)

**Events Published:**
- `contest.created`
- `contest.started`
- `contest.ended`
- `winner.selected`
- `prize.distributed`

---

#### Moderation Module
**Responsibility:** Content moderation, reporting, and user restrictions.

**Key Responsibilities:**
- Content reporting
- Moderation actions
- User restrictions
- Auto-escalation

**Depends On:**
- Users Module (reporters, moderators, targets)
- Stories Module (content)
- Comments Module (content)

**Events Published:**
- `content.reported`
- `user.restricted`
- `moderation.action.taken`

---

#### Payments Module
**Responsibility:** Payment processing, webhook handling, and transaction history.

**Key Responsibilities:**
- Payment intent creation
- Webhook processing
- Refund handling
- Transaction history
- Revenue tracking

**Depends On:**
- Users Module (payer, payee)
- Books Module (purchases, rentals)
- Contests Module (prizes)

**Events Published:**
- `payment.completed`
- `payment.failed`
- `refund.processed`

---

## Shared Kernel

These components are shared across all modules:

### Database Service
- Connection management
- Transaction handling
- Query execution

### Cache Service
- Session cache
- Rate limiting
- Hot query cache

### Event Bus
- Internal event publishing and subscribing
- Async event handling

### Logger Service
- Structured logging
- Correlation IDs

### WAF Middleware
- Rate limiting
- IP blocking
- Threat detection

---

## Module Dependency Rules

### Allowed Dependencies

```
Shared Kernel
    ↑
    ↑
All Modules
```

**Rule:** All modules can depend on the Shared Kernel, but the Shared Kernel cannot depend on any module.

### Forbidden Patterns

#### ❌ No Direct Database Access Across Modules
```typescript
// BAD: Stories module directly accessing Users table
const user = await db.query.users.findFirst({ where: ... });

// GOOD: Stories module using Users repository
const user = await this.usersRepository.findById(userId);
```

#### ❌ No Direct Service Calls Across Modules
```typescript
// BAD: Stories module directly calling Users service
const user = await this.usersService.findById(userId);

// GOOD: Use events or repository
this.eventBus.publish(new StoryCreatedEvent(...));
```

#### ❌ No Shared Mutable State
```typescript
// BAD: Sharing mutable state
export const currentUser = {};

// GOOD: Passing state through parameters
async function processStory(userId: string, story: Story) { ... }
```

---

## Communication Patterns

### Synchronous
- Controller → Service → Repository → Database
- Guard/Interceptor/Pipe pipeline in NestJS

### Asynchronous
- Module → Event Bus → Another Module
- Non-critical operations: notifications, analytics, search indexing

---

## New Joiner Guide

### How to Add a New Feature

1. **Identify the owning module** — which module owns this data?
2. **Check the dependency rules** — can your module depend on the target module?
3. **Use events for cross-module communication** — publish an event, don't call directly
4. **Add to Shared Kernel only if truly shared** — if only one module uses it, keep it inside the module

### How to Understand a Module

1. Read this document for module responsibilities
2. Read the module's README for implementation details
3. Look at the module's `*.module.ts` for NestJS configuration
4. Look at the module's `*.service.ts` for business logic
5. Look at the module's `*.repository.ts` for data access

---

## Dependency Resolution

### Auth ↔ Users Dependency

**Problem:** Auth module needs to look up users during authentication, and Users module needs to react to user registration events. This creates a potential circular dependency.

**Solution:**
- **Auth module** accesses Users Module **only through the Users Repository interface** (database read), NOT through Users Service
- **Users module** listens to `user.registered` event from Auth module
- **No circular dependency**: Auth → Users Repository (read-only), Users → Auth (none)
- **Communication is one-directional**: Auth publishes events, Users consumes them

**Implementation Pattern:**
```typescript
// Auth module - uses UsersRepository interface (read-only)
@Injectable()
class AuthService {
  constructor(
    private usersRepository: IUsersRepository,  // Interface only, not service
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersRepository.findByEmail(email);  // Read-only
    // ... validate password, issue JWT
  }
}

// Users module - listens to Auth events
@Injectable()
class UsersService {
  constructor(private eventBus: IEventBus) {
    this.eventBus.subscribe('user.registered', this.handleUserRegistered.bind(this));
  }

  async handleUserRegistered(event: UserRegisteredEvent) {
    // Initialize user profile, stats, etc.
  }
}
```

**Rule:** Auth module can read user data but never modifies it. User creation/modification happens in Auth module during registration, then Users module extends the data via events.

---

*This document defines the module boundaries for Hakawi.*
