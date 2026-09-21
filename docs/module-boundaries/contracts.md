# Module Contracts
## Hakawi Module Boundaries

This document defines the contracts and interfaces between modules in the Hakawi platform.

---

## Contract Principles

### Design Rules
1. **Interface Segregation**: Small, focused interfaces
2. **Dependency Inversion**: Depend on abstractions
3. **Explicit Dependencies**: All dependencies declared
4. **Versioned APIs**: Backward compatibility maintained
5. **Event-Driven**: Async communication via events

---

## Core Module Contracts

### 1. Users Module

#### Interfaces

```typescript
// IUsersService
interface IUsersService {
  create(data: CreateUserDto): Promise<User>;
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, data: UpdateUserDto): Promise<User>;
  delete(id: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void>;
}

// IUsersRepository
interface IUsersRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  findMany(filters: UserFilters): Promise<User[]>;
  count(filters: UserFilters): Promise<number>;
}
```

#### Events

```typescript
// Events emitted
UserCreatedEvent {
  userId: string;
  email: string;
  name: string;
  timestamp: Date;
}

UserUpdatedEvent {
  userId: string;
  changes: Partial<User>;
  timestamp: Date;
}

UserDeletedEvent {
  userId: string;
  timestamp: Date;
}

EmailVerifiedEvent {
  userId: string;
  timestamp: Date;
}

PasswordResetEvent {
  userId: string;
  timestamp: Date;
}
```

#### Dependencies
- Database (PostgreSQL)
- Valkey (sessions, tokens)
- Email service
- OAuth providers

---

### 2. Stories Module

#### Interfaces

```typescript
// IStoriesService
interface IStoriesService {
  create(authorId: string, data: CreateStoryDto): Promise<Story>;
  findById(id: string): Promise<Story>;
  findByAuthor(authorId: string, filters: StoryFilters): Promise<Story[]>;
  findByCategory(category: string, page: number, limit: number): Promise<Story[]>;
  search(query: string, filters: SearchFilters): Promise<Story[]>;
  update(id: string, authorId: string, data: UpdateStoryDto): Promise<Story>;
  delete(id: string, authorId: string): Promise<void>;
  publish(id: string, authorId: string): Promise<Story>;
  unpublish(id: string, authorId: string): Promise<Story>;
  incrementViews(id: string): Promise<void>;
}

// IStoriesRepository
interface IStoriesRepository {
  create(data: CreateStoryData): Promise<Story>;
  findById(id: string): Promise<Story | null>;
  findByAuthorId(authorId: string): Promise<Story[]>;
  findByCategory(category: string): Promise<Story[]>;
  search(query: string): Promise<Story[]>;
  update(id: string, data: Partial<Story>): Promise<Story>;
  delete(id: string): Promise<void>;
  findPublished(filters: StoryFilters): Promise<Story[]>;
  count(filters: StoryFilters): Promise<number>;
}
```

#### Events

```typescript
StoryCreatedEvent {
  storyId: string;
  authorId: string;
  title: string;
  category: string;
  timestamp: Date;
}

StoryUpdatedEvent {
  storyId: string;
  authorId: string;
  changes: Partial<Story>;
  timestamp: Date;
}

StoryPublishedEvent {
  storyId: string;
  authorId: string;
  timestamp: Date;
}

StoryDeletedEvent {
  storyId: string;
  authorId: string;
  timestamp: Date;
}
```

#### Dependencies
- Users module
- Categories module
- Sanity CMS
- Search engine (PostgreSQL full-text)

---

### 3. Interactions Module

#### Interfaces

```typescript
// IFollowsService
interface IFollowsService {
  follow(followerId: string, followingId: string): Promise<Follow>;
  unfollow(followerId: string, followingId: string): Promise<void>;
  getFollowers(userId: string, page: number, limit: number): Promise<User[]>;
  getFollowing(userId: string, page: number, limit: number): Promise<User[]>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  countFollowers(userId: string): Promise<number>;
  countFollowing(userId: string): Promise<number>;
}

// IReactionsService
interface IReactionsService {
  addReaction(userId: string, storyId: string, type: ReactionType): Promise<Reaction>;
  removeReaction(userId: string, storyId: string): Promise<void>;
  getReactions(storyId: string): Promise<Reaction[]>;
  getReactionCounts(storyId: string): Promise<Map<ReactionType, number>>;
  getUserReaction(userId: string, storyId: string): Promise<Reaction | null>;
}

// ICommentsService
interface ICommentsService {
  create(userId: string, storyId: string, content: string, parentId?: string): Promise<Comment>;
  findById(id: string): Promise<Comment>;
  findByStory(storyId: string, page: number, limit: number): Promise<Comment[]>;
  update(id: string, userId: string, content: string): Promise<Comment>;
  delete(id: string, userId: string): Promise<void>;
  getReplies(commentId: string): Promise<Comment[]>;
  countComments(storyId: string): Promise<number>;
}
```

#### Events

```typescript
FollowCreatedEvent {
  followerId: string;
  followingId: string;
  timestamp: Date;
}

FollowDeletedEvent {
  followerId: string;
  followingId: string;
  timestamp: Date;
}

ReactionAddedEvent {
  userId: string;
  storyId: string;
  reactionType: ReactionType;
  timestamp: Date;
}

ReactionRemovedEvent {
  userId: string;
  storyId: string;
  timestamp: Date;
}

CommentCreatedEvent {
  commentId: string;
  userId: string;
  storyId: string;
  parentId?: string;
  timestamp: Date;
}

CommentDeletedEvent {
  commentId: string;
  userId: string;
  timestamp: Date;
}
```

#### Dependencies
- Users module
- Stories module
- Notifications module

---

### 4. Notifications Module

#### Interfaces

```typescript
// INotificationsService
interface INotificationsService {
  create(data: CreateNotificationDto): Promise<Notification>;
  findById(id: string): Promise<Notification>;
  findByUser(userId: string, page: number, limit: number): Promise<Notification[]>;
  markAsRead(id: string, userId: string): Promise<Notification>;
  markAllAsRead(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  delete(id: string, userId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
}

// INotificationsRepository
interface INotificationsRepository {
  create(data: CreateNotificationData): Promise<Notification>;
  findById(id: string): Promise<Notification | null>;
  findByUserId(userId: string): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
}
```

#### Events

```typescript
NotificationCreatedEvent {
  notificationId: string;
  userId: string;
  type: NotificationType;
  actorId?: string;
  entityId?: string;
  timestamp: Date;
}

NotificationReadEvent {
  notificationId: string;
  userId: string;
  timestamp: Date;
}
```

#### Dependencies
- Users module
- Events module (internal)
- Email service (optional)

---

### 5. Books Module

#### Interfaces

```typescript
// IBooksService
interface IBooksService {
  create(authorId: string, data: CreateBookDto): Promise<Book>;
  findById(id: string): Promise<Book>;
  findByAuthor(authorId: string, page: number, limit: number): Promise<Book[]>;
  search(query: string, filters: BookFilters): Promise<Book[]>;
  update(id: string, authorId: string, data: UpdateBookDto): Promise<Book>;
  delete(id: string, authorId: string): Promise<void>;
  purchase(userId: string, bookId: string): Promise<Purchase>;
  rent(userId: string, bookId: string, duration: RentalDuration): Promise<Rental>;
  getUserLibrary(userId: string): Promise<LibraryItem[]>;
}

// IBooksRepository
interface IBooksRepository {
  create(data: CreateBookData): Promise<Book>;
  findById(id: string): Promise<Book | null>;
  findByAuthorId(authorId: string): Promise<Book[]>;
  search(query: string): Promise<Book[]>;
  update(id: string, data: Partial<Book>): Promise<Book>;
  delete(id: string): Promise<void>;
  findPublished(filters: BookFilters): Promise<Book[]>;
  count(filters: BookFilters): Promise<number>;
}
```

#### Events

```typescript
BookCreatedEvent {
  bookId: string;
  authorId: string;
  title: string;
  timestamp: Date;
}

BookPurchasedEvent {
  bookId: string;
  userId: string;
  price: number;
  timestamp: Date;
}

BookRentedEvent {
  bookId: string;
  userId: string;
  duration: RentalDuration;
  timestamp: Date;
}
```

#### Dependencies
- Users module
- Payments module
- File storage
- Valkey (rental access)

---

### 6. Payments Module

#### Interfaces

```typescript
// IPaymentsService
interface IPaymentsService {
  initiatePayment(userId: string, amount: number, currency: string): Promise<Payment>;
  processWebhook(data: WebhookData): Promise<void>;
  getPaymentHistory(userId: string, page: number, limit: number): Promise<Payment[]>;
  refund(paymentId: string, reason: string): Promise<Refund>;
  getTransactionStatus(transactionId: string): Promise<PaymentStatus>;
}

// IPaymentsRepository
interface IPaymentsRepository {
  create(data: CreatePaymentData): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<Payment[]>;
  update(id: string, data: Partial<Payment>): Promise<Payment>;
  findByTransactionId(transactionId: string): Promise<Payment | null>;
}
```

#### Events

```typescript
PaymentInitiatedEvent {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  timestamp: Date;
}

PaymentCompletedEvent {
  paymentId: string;
  userId: string;
  amount: number;
  transactionId: string;
  timestamp: Date;
}

PaymentFailedEvent {
  paymentId: string;
  userId: string;
  reason: string;
  timestamp: Date;
}

RefundProcessedEvent {
  paymentId: string;
  amount: number;
  reason: string;
  timestamp: Date;
}
```

#### Dependencies
- Users module
- Paymob API
- Valkey (transaction state)

---

## Cross-Module Communication

### Event-Driven Communication

```typescript
// Event bus
@Injectable()
export class EventBus {
  async emit(event: Event): Promise<void> {
    // Publish to event bus
    await this.eventEmitter.emit(event);
  }
  
  async on(eventType: string, handler: EventHandler): Promise<void> {
    // Subscribe to event
    await this.eventEmitter.on(eventType, handler);
  }
}

// Example usage
@Injectable()
export class StoriesService {
  constructor(private eventBus: EventBus) {}
  
  async publish(id: string, authorId: string): Promise<Story> {
    const story = await this.publishStory(id, authorId);
    
    // Emit event
    await this.eventBus.emit(new StoryPublishedEvent({
      storyId: story.id,
      authorId: story.authorId,
      timestamp: new Date()
    }));
    
    return story;
  }
}
```

### Direct Service Calls

```typescript
// When events are not appropriate
@Injectable()
export class NotificationsService {
  constructor(
    private usersService: IUsersService,
    private storiesService: IStoriesService
  ) {}
  
  async notifyStoryPublished(storyId: string): Promise<void> {
    const story = await this.storiesService.findById(storyId);
    const author = await this.usersService.findById(story.authorId);
    
    // Create notification
  }
}
```

---

## API Contracts

### REST API Contracts

#### Users API

```typescript
// POST /api/v1/auth/register
Request: {
  email: string;
  password: string;
  name: string;
  username: string;
}

Response: {
  user: User;
  token: string;
  refreshToken: string;
}

// GET /api/v1/users/:id
Response: {
  user: User;
}

// PUT /api/v1/users/:id
Request: {
  name?: string;
  bio?: string;
  avatar?: string;
}

Response: {
  user: User;
}
```

#### Stories API

```typescript
// GET /api/v1/stories
Query: {
  page?: number;
  limit?: number;
  category?: string;
  author?: string;
  q?: string;
}

Response: {
  stories: Story[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// POST /api/v1/stories
Request: {
  title: string;
  content: string;
  category: string;
  tags?: string[];
}

Response: {
  story: Story;
}

// PUT /api/v1/stories/:id
Request: {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
}

Response: {
  story: Story;
}
```

---

## Contract Testing

### Pact Testing

```typescript
// Consumer test
describe('Stories API', () => {
  it('should create a story', async () => {
    await pact
      .uponReceiving('a request to create a story')
      .withRequest({
        method: 'POST',
        path: '/api/v1/stories',
        headers: {
          'Authorization': 'Bearer token'
        },
        body: {
          title: 'Test Story',
          content: '<p>Content</p>',
          category: 'fiction'
        }
      })
      .willRespondWith({
        status: 201,
        body: {
          story: {
            id: like('story-uuid'),
            title: 'Test Story',
            content: '<p>Content</p>',
            category: 'fiction'
          }
        }
      });
    
    const story = await storiesService.create('user-id', {
      title: 'Test Story',
      content: '<p>Content</p>',
      category: 'fiction'
    });
    
    expect(story.title).toBe('Test Story');
  });
});
```

---

## Versioning Strategy

### API Versioning

- **URL Versioning**: `/api/v1/`, `/api/v2/`
- **Deprecation**: 6 months notice
- **Sunset**: 12 months after deprecation
- **Backward Compatibility**: Maintained within major version

### Breaking Changes

- Major version bump required
- Migration guide provided
- Deprecation warnings added
- Sunset date announced

---

## Error Handling

### Standard Error Format

```typescript
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
   "timestamp": "YYYY-MM-DDTHH:mm:ssZ",
  "path": "/api/v1/users"
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| VALIDATION_ERROR | Input validation failed |
| UNAUTHORIZED | Missing or invalid token |
| FORBIDDEN | Insufficient permissions |
| NOT_FOUND | Resource not found |
| CONFLICT | Resource already exists |
| RATE_LIMIT_EXCEEDED | Too many requests |
| INTERNAL_ERROR | Server error |

---

*This document defines module contracts for the Hakawi platform.*
