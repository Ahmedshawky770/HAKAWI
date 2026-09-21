# Event Schema Registry and Dead Letter Queue Strategy

## Hakawi - Event-Driven Communication Standards

---

## 1. Event Schema Registry

### Purpose

The Event Schema Registry is a **single source of truth** for all event schemas in the system. It ensures:
- **Consistency**: All events follow the same structure
- **Versioning**: Events can evolve without breaking consumers
- **Documentation**: Event contracts are explicit and documented
- **Validation**: Events are validated against schemas before publishing

---

### Event Naming Convention

All events follow the pattern: `<domain>.<entity>.<action>`

**Examples:**
```
user.registered
user.updated
user.verified
user.logged_in
user.logged_out

story.created
story.updated
story.published
story.deleted

book.purchased
book.rented

contest.created
contest.ended
contest.winner_selected

payment.completed
payment.failed
payment.refunded

notification.created
notification.read
```

---

### Event Schema Standard

Every event must include these base fields:

```typescript
interface BaseEvent {
  id: string;              // Unique event ID (UUID v4)
  type: string;            // Event type (e.g., "user.registered")
  version: string;         // Schema version (e.g., "1.0.0")
  timestamp: string;       // ISO 8601 timestamp
  source: string;          // Service that emitted the event (e.g., "auth")
  correlationId: string;   // Request correlation ID for tracing
  causationId?: string;    // Event ID that caused this event (if applicable)
}
```

**Example - User Registered Event:**

```typescript
interface UserRegisteredEvent extends BaseEvent {
  type: 'user.registered';
  version: '1.0.0';
  payload: {
    userId: string;
    email: string;
    name: string;
    accountType: 'reader' | 'writer' | 'publisher' | 'admin';
  };
}
```

**Example - Story Published Event:**

```typescript
interface StoryPublishedEvent extends BaseEvent {
  type: 'story.published';
  version: '1.0.0';
  payload: {
    storyId: string;
    authorId: string;
    title: string;
    category: string;
    tags: string[];
    publishedAt: string;
  };
}
```

---

### Event Versioning Strategy

Events are versioned using **semantic versioning** (MAJOR.MINOR.PATCH):

| Version Change | Meaning | Example |
|----------------|---------|---------|
| **MAJOR** | Breaking change | Remove field, change type |
| **MINOR** | Add new optional field | Add `description` field |
| **PATCH** | Fix typo, update description | Fix field description |

**Versioning Rules:**

1. **Never change or remove fields in existing versions**
2. **Always increment version when schema changes**
3. **Support multiple versions simultaneously during migration**
4. **Deprecate old versions after all consumers migrate**

**Example - Version Migration:**

```typescript
// v1.0.0 (original)
interface UserRegisteredEventV1 {
  userId: string;
  email: string;
  name: string;
}

// v1.1.0 (add optional field)
interface UserRegisteredEventV1_1 {
  userId: string;
  email: string;
  name: string;
  accountType?: 'reader' | 'writer' | 'publisher' | 'admin';  // New optional field
}

// v2.0.0 (breaking change - rename field)
interface UserRegisteredEventV2 {
  userId: string;
  email: string;
  fullName: string;  // Renamed from 'name' to 'fullName'
  accountType: 'reader' | 'writer' | 'publisher' | 'admin';  // Now required
}
```

---

### Complete Event Registry

All events in the system, organized by domain:

#### User Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `user.registered` | 1.0.0 | New user registered | `userId, email, name, accountType` |
| `user.updated` | 1.0.0 | User profile updated | `userId, changes: { field: oldValue, newValue }` |
| `user.verified` | 1.0.0 | User verification approved | `userId, verificationType` |
| `user.logged_in` | 1.0.0 | User logged in | `userId, ipAddress, userAgent` |
| `user.logged_out` | 1.0.0 | User logged out | `userId` |
| `user.deleted` | 1.0.0 | User account deleted | `userId, reason` |
| `user.upgraded` | 1.0.0 | User account type changed | `userId, oldType, newType` |

#### Story Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `story.created` | 1.0.0 | New story created | `storyId, authorId, title, category` |
| `story.updated` | 1.0.0 | Story content updated | `storyId, authorId, changes` |
| `story.published` | 1.0.0 | Story published | `storyId, authorId, title, category, tags, publishedAt` |
| `story.rejected` | 1.0.0 | Story rejected by moderator | `storyId, authorId, reason` |
| `story.deleted` | 1.0.0 | Story deleted | `storyId, authorId` |
| `story.viewed` | 1.0.0 | Story viewed | `storyId, viewerId, viewDuration` |

#### Reaction Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `reaction.created` | 1.0.0 | Reaction added | `reactionId, userId, targetId, targetType, reactionType` |
| `reaction.removed` | 1.0.0 | Reaction removed | `reactionId, userId, targetId` |

#### Comment Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `comment.created` | 1.0.0 | Comment added | `commentId, userId, storyId, parentCommentId?` |
| `comment.updated` | 1.0.0 | Comment edited | `commentId, userId, changes` |
| `comment.deleted` | 1.0.0 | Comment deleted | `commentId, userId` |

#### Follow Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `follow.created` | 1.0.0 | User followed | `followerId, followingId` |
| `follow.removed` | 1.0.0 | User unfollowed | `followerId, followingId` |

#### Book Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `book.created` | 1.0.0 | Book created | `bookId, authorId, title, price` |
| `book.purchased` | 1.0.0 | Book purchased | `bookId, buyerId, price, transactionId` |
| `book.rented` | 1.0.0 | Book rented | `bookId, renterId, rentalPeriod, expiresAt` |
| `book.rental_extended` | 1.0.0 | Rental extended | `bookId, userId, newExpiresAt` |
| `book.rental_expired` | 1.0.0 | Rental expired | `bookId, userId` |

#### Contest Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `contest.created` | 1.0.0 | Contest created | `contestId, publisherId, title, theme` |
| `contest.started` | 1.0.0 | Contest started | `contestId` |
| `contest.ended` | 1.0.0 | Contest ended | `contestId` |
| `contest.submission_created` | 1.0.0 | Entry submitted | `submissionId, contestId, userId, storyId` |
| `contest.vote_cast` | 1.0.0 | Vote cast | `voteId, contestId, userId, submissionId` |
| `contest.winner_selected` | 1.0.0 | Winner selected | `contestId, winnerId, submissionId, prize` |

#### Payment Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `payment.initiated` | 1.0.0 | Payment started | `paymentId, userId, amount, currency, type` |
| `payment.completed` | 1.0.0 | Payment successful | `paymentId, userId, amount, transactionId` |
| `payment.failed` | 1.0.0 | Payment failed | `paymentId, userId, reason, errorCode` |
| `payment.refunded` | 1.0.0 | Payment refunded | `paymentId, userId, amount, reason` |
| `payment.webhook_received` | 1.0.0 | Webhook from Paymob | `paymentId, status, signature` |

#### Notification Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `notification.created` | 1.0.0 | Notification created | `notificationId, userId, type, message` |
| `notification.read` | 1.0.0 | Notification read | `notificationId, userId` |
| `notification.batch_created` | 1.0.0 | Batch notifications | `notificationIds, userIds, type, message` |

#### Message Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `message.created` | 1.0.0 | Message sent | `messageId, senderId, recipientId, content` |
| `message.deleted` | 1.0.0 | Message deleted | `messageId, userId` |

#### Moderation Events

| Event | Version | Description | Payload |
|-------|---------|-------------|---------|
| `report.created` | 1.0.0 | Content reported | `reportId, reporterId, targetId, targetType, reason` |
| `report.resolved` | 1.0.0 | Report resolved | `reportId, moderatorId, action, reason` |
| `user.restricted` | 1.0.0 | User restricted | `userId, restrictionType, duration, reason` |

---

## 2. Dead Letter Queue (DLQ) Strategy

### Purpose

When event processing fails, the event should not be lost. The DLQ ensures:
- **No data loss**: Failed events are stored for later processing
- **Visibility**: Failed events are visible for debugging
- **Retry**: Failed events can be retried manually or automatically
- **Alerting**: Team is notified of processing failures

---

### When to Use DLQ

Events are moved to DLQ when:
1. **Handler throws exception** after all retries
2. **Handler timeout** (exceeds max processing time)
3. **Invalid event schema** (cannot be deserialized)
4. **Dependency unavailable** (database, external API down)
5. **Manual rejection** (developer moves event manually for debugging)

---

### DLQ Structure

```typescript
interface DeadLetterEvent {
  id: string;                    // DLQ entry ID
  originalEvent: BaseEvent;      // Original event that failed
  error: {
    message: string;             // Error message
    stack: string;               // Stack trace
    code?: string;               // Error code
  };
  retryCount: number;            // Number of retry attempts
  firstFailedAt: string;         // ISO 8601 timestamp
  lastFailedAt: string;          // ISO 8601 timestamp
  nextRetryAt?: string;          // ISO 8601 timestamp (for scheduled retry)
  resolvedAt?: string;           // ISO 8601 timestamp (when resolved)
  resolvedBy?: string;           // User ID or system that resolved it
  resolution?: string;           // How it was resolved
}
```

---

### Retry Strategy

| Retry | Delay | Rationale |
|-------|-------|-----------|
| 1 | 5 seconds | Quick retry for transient errors |
| 2 | 30 seconds | Backoff for temporary issues |
| 3 | 2 minutes | Further backoff |
| 4 | 10 minutes | Slow down for persistent issues |
| 5 | 1 hour | Final retry before DLQ |

**Exponential Backoff Formula:**
```typescript
delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
// baseDelay = 5 seconds
// maxDelay = 1 hour
```

---

### DLQ Implementation

```typescript
@Injectable()
class EventBusService {
  private dlq: DeadLetterQueue;
  private maxRetries = 5;

  async publish(event: BaseEvent): Promise<void> {
    try {
      await this.processEvent(event);
    } catch (error) {
      await this.handleFailure(event, error);
    }
  }

  private async handleFailure(event: BaseEvent, error: Error): Promise<void> {
    const existingEntry = await this.dlq.findByEventId(event.id);

    if (existingEntry && existingEntry.retryCount >= this.maxRetries) {
      // Move to DLQ permanently
      await this.dlq.create({
        originalEvent: event,
        error: { message: error.message, stack: error.stack },
        retryCount: existingEntry.retryCount + 1,
        firstFailedAt: existingEntry.firstFailedAt,
        lastFailedAt: new Date().toISOString(),
      });

      // Alert team
      await this.alertingService.sendAlert({
        level: 'error',
        message: `Event ${event.type} failed after ${this.maxRetries} retries`,
        eventId: event.id,
      });
    } else {
      // Retry with backoff
      const retryCount = existingEntry ? existingEntry.retryCount + 1 : 1;
      const delay = this.calculateDelay(retryCount);

      await this.dlq.create({
        originalEvent: event,
        error: { message: error.message, stack: error.stack },
        retryCount,
        firstFailedAt: existingEntry?.firstFailedAt || new Date().toISOString(),
        lastFailedAt: new Date().toISOString(),
        nextRetryAt: new Date(Date.now() + delay).toISOString(),
      });
    }
  }
}
```

---

### DLQ Management

#### Viewing Failed Events

```typescript
// API endpoint for admins
GET /admin/events/dlq

Response:
{
  "events": [
    {
      "id": "dlq-123",
      "originalEvent": { ... },
      "error": { "message": "...", "stack": "..." },
      "retryCount": 5,
      "firstFailedAt": "2024-01-15T10:00:00Z",
      "lastFailedAt": "2024-01-15T11:00:00Z"
    }
  ],
  "total": 3
}
```

#### Retrying Failed Events

```typescript
// Retry single event
POST /admin/events/dlq/{id}/retry

// Retry all failed events
POST /admin/events/dlq/retry-all
```

#### Resolving Failed Events

```typescript
// Mark as resolved (with reason)
POST /admin/events/dlq/{id}/resolve
{
  "resolution": "Fixed handler bug in v1.2.3",
  "resolvedBy": "admin-123"
}
```

---

### Monitoring

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| **DLQ size** | > 10 events | Page on-call engineer |
| **Event processing rate** | < 90% success | Investigate immediately |
| **Event latency** | > 30s average | Check for bottlenecks |
| **Retry rate** | > 20% of events | Check for systemic issues |

---

### Best Practices

1. **Never lose events** — DLQ ensures no data loss
2. **Monitor DLQ size** — Set up alerts for DLQ growth
3. **Process DLQ regularly** — Retry or resolve failed events daily
4. **Document resolutions** — Track why events failed and how they were fixed
5. **Test failure scenarios** — Simulate failures in testing to verify DLQ behavior

---

## 3. Event-Driven Communication Rules

### Rules for Event Usage

1. **Critical operations use synchronous calls**
   - Payment processing
   - Authentication
   - Authorization checks

2. **Non-critical operations use async events**
   - Notifications
   - Analytics
   - Search indexing
   - Email sending

3. **Events are immutable**
   - Never modify published events
   - Publish new event for new state

4. **Events are idempotent**
   - Handlers can process same event multiple times safely
   - Use event ID for deduplication

5. **Events are ordered per aggregate**
   - Events for same entity are processed in order
   - Use entity ID as partition key

---

## 4. Implementation Example

### Publishing an Event

```typescript
// In StoriesModule
@Injectable()
class StoriesService {
  constructor(private eventBus: IEventBus) {}

  async publishStory(storyId: string) {
    const story = await this.repository.findById(storyId);
    
    // Update status
    await this.repository.update(storyId, { status: 'published' });
    
    // Publish event
    await this.eventBus.publish({
      id: uuid(),
      type: 'story.published',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      source: 'stories',
      correlationId: request.correlationId,
      payload: {
        storyId,
        authorId: story.authorId,
        title: story.title,
        category: story.category,
        tags: story.tags,
        publishedAt: new Date().toISOString(),
      },
    });
  }
}
```

### Subscribing to an Event

```typescript
// In NotificationsModule
@Injectable()
class NotificationsService {
  constructor(private eventBus: IEventBus) {
    // Subscribe to story.published event
    this.eventBus.subscribe('story.published', this.handleStoryPublished.bind(this));
  }

  async handleStoryPublished(event: StoryPublishedEvent) {
    // Notify followers
    const followers = await this.followsRepository.findByFollowingId(event.payload.authorId);
    
    for (const follower of followers) {
      await this.createNotification({
        userId: follower.followerId,
        type: 'story_published',
        message: `New story from ${event.payload.title}`,
        data: { storyId: event.payload.storyId },
      });
    }
  }
}
```

---

## 5. Testing Event-Driven Code

### Testing Event Publishing

```typescript
it('should publish story.published event', async () => {
  const eventBus = mockEventBus();
  const service = new StoriesService(repository, eventBus);

  await service.publishStory('story-123');

  expect(eventBus.publish).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'story.published',
      payload: expect.objectContaining({
        storyId: 'story-123',
      }),
    })
  );
});
```

### Testing Event Handling

```typescript
it('should handle story.published event', async () => {
  const service = new NotificationsService(eventBus, repository);
  
  const event: StoryPublishedEvent = {
    id: 'event-123',
    type: 'story.published',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    source: 'stories',
    correlationId: 'req-123',
    payload: {
      storyId: 'story-123',
      authorId: 'user-456',
      title: 'Test Story',
    },
  };

  await service.handleStoryPublished(event);

  expect(repository.create).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'follower-789',
      type: 'story_published',
    })
  );
});
```

---

## 6. Migration and Rollback

### Migrating Events

When event schema changes (new version):

1. **Deploy new event schema** (v2.0.0)
2. **Update publishers** to emit both v1.0.0 and v2.0.0
3. **Update consumers** to handle both versions
4. **Monitor** for v1.0.0 events in DLQ
5. **Remove v1.0.0 support** after all consumers migrated

### Rolling Back Events

If new event version causes issues:

1. **Revert publishers** to old version
2. **Continue processing** old version events
3. **Fix issue** in new version
4. **Re-deploy** when ready

---

## Related Documentation

- ADR-009: Event-Driven Communication
- Module Boundaries: `module-boundaries/overview/module-boundaries.md`
- Testing Strategy: `testing/testing-strategy.md`

---

*This document defines the event schema registry and DLQ strategy for Hakawi. All events must follow these standards to ensure consistency, reliability, and maintainability.*
