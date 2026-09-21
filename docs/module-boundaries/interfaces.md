# Interfaces
## Hakawi Module Boundaries

This document defines the public interfaces for each module in the Hakawi platform.

---

## Interface Design Principles

### Guidelines
1. **Single Responsibility**: Each interface has one purpose
2. **Explicit Dependencies**: All dependencies are explicit
3. **No Circular Dependencies**: Modules depend inward only
4. **Stable Interfaces**: Public interfaces change rarely
5. **Internal Implementation**: Internal details are hidden

---

## Module Dependency Graph

```
                    ┌─────────────────┐
                    │     Core        │
                    │  (Shared)       │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │    Users    │  │  Stories    │  │  Comments   │
     │   Module    │  │   Module    │  │   Module    │
     └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
            │                │                │
            └────────────────┼────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   Interactions  │
                    │     Module      │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │Notifications│  │   Messages  │  │   Search    │
     │   Module    │  │   Module    │  │   Module    │
     └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Public Interfaces

### Users Module

#### IUsersService

```typescript
export interface IUsersService {
  // User CRUD
  create(data: CreateUserDto): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  update(id: string, data: UpdateUserDto): Promise<User>;
  delete(id: string): Promise<void>;
  
  // User operations
  verifyEmail(token: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void>;
  
  // User queries
  search(query: string, page: number, limit: number): Promise<User[]>;
  getWriters(page: number, limit: number): Promise<User[]>;
  getPublishers(page: number, limit: number): Promise<User[]>;
  
  // User stats
  getStats(userId: string): Promise<UserStats>;
  getFollowers(userId: string, page: number, limit: number): Promise<User[]>;
  getFollowing(userId: string, page: number, limit: number): Promise<User[]>;
}
```

#### IUsersRepository

```typescript
export interface IUsersRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  findMany(filters: UserFilters): Promise<User[]>;
  count(filters: UserFilters): Promise<number>;
  exists(email: string): Promise<boolean>;
  existsUsername(username: string): Promise<boolean>;
}
```

### Stories Module

#### IStoriesService

```typescript
export interface IStoriesService {
  // Story CRUD
  create(authorId: string, data: CreateStoryDto): Promise<Story>;
  findById(id: string): Promise<Story | null>;
  findByAuthor(authorId: string, page: number, limit: number): Promise<Story[]>;
  findByCategory(category: string, page: number, limit: number): Promise<Story[]>;
  search(query: string, page: number, limit: number): Promise<Story[]>;
  update(id: string, authorId: string, data: UpdateStoryDto): Promise<Story>;
  delete(id: string, authorId: string): Promise<void>;
  
  // Story operations
  publish(id: string, authorId: string): Promise<Story>;
  unpublish(id: string, authorId: string): Promise<Story>;
  incrementViews(id: string): Promise<void>;
  
  // Story queries
  getTrending(page: number, limit: number): Promise<Story[]>;
  getRecent(page: number, limit: number): Promise<Story[]>;
  getFeatured(page: number, limit: number): Promise<Story[]>;
  
  // Story stats
  getStats(storyId: string): Promise<StoryStats>;
}
```

#### IStoriesRepository

```typescript
export interface IStoriesRepository {
  create(data: CreateStoryData): Promise<Story>;
  findById(id: string): Promise<Story | null>;
  findByAuthorId(authorId: string): Promise<Story[]>;
  findByCategory(category: string): Promise<Story[]>;
  search(query: string): Promise<Story[]>;
  update(id: string, data: Partial<Story>): Promise<Story>;
  delete(id: string): Promise<void>;
  findPublished(filters: StoryFilters): Promise<Story[]>;
  count(filters: StoryFilters): Promise<number>;
  incrementViews(id: string): Promise<void>;
}
```

### Comments Module

#### ICommentsService

```typescript
export interface ICommentsService {
  create(userId: string, storyId: string, content: string, parentId?: string): Promise<Comment>;
  findById(id: string): Promise<Comment | null>;
  findByStory(storyId: string, page: number, limit: number): Promise<Comment[]>;
  getReplies(commentId: string, page: number, limit: number): Promise<Comment[]>;
  update(id: string, userId: string, content: string): Promise<Comment>;
  delete(id: string, userId: string): Promise<void>;
  countComments(storyId: string): Promise<number>;
  countReplies(commentId: string): Promise<number>;
}
```

### Interactions Module

#### IFollowsService

```typescript
export interface IFollowsService {
  follow(followerId: string, followingId: string): Promise<Follow>;
  unfollow(followerId: string, followingId: string): Promise<void>;
  getFollowers(userId: string, page: number, limit: number): Promise<User[]>;
  getFollowing(userId: string, page: number, limit: number): Promise<User[]>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  countFollowers(userId: string): Promise<number>;
  countFollowing(userId: string): Promise<number>;
}
```

#### IReactionsService

```typescript
export interface IReactionsService {
  addReaction(userId: string, storyId: string, type: ReactionType): Promise<Reaction>;
  removeReaction(userId: string, storyId: string): Promise<void>;
  getReactions(storyId: string): Promise<Reaction[]>;
  getReactionCounts(storyId: string): Promise<Map<ReactionType, number>>;
  getUserReaction(userId: string, storyId: string): Promise<Reaction | null>;
  getUserStoryReactions(userId: string): Promise<Reaction[]>;
}
```

### Books Module

#### IBooksService

```typescript
export interface IBooksService {
  create(authorId: string, data: CreateBookDto): Promise<Book>;
  findById(id: string): Promise<Book | null>;
  findByAuthor(authorId: string, page: number, limit: number): Promise<Book[]>;
  search(query: string, page: number, limit: number): Promise<Book[]>;
  update(id: string, authorId: string, data: UpdateBookDto): Promise<Book>;
  delete(id: string, authorId: string): Promise<void>;
  
  // Purchase and rental
  purchase(userId: string, bookId: string): Promise<Purchase>;
  rent(userId: string, bookId: string, duration: RentalDuration): Promise<Rental>;
  getUserLibrary(userId: string): Promise<LibraryItem[]>;
  hasAccess(userId: string, bookId: string): Promise<boolean>;
  
  // Stats
  getSalesStats(bookId: string): Promise<SalesStats>;
  getRentalStats(bookId: string): Promise<RentalStats>;
}
```

### Payments Module

#### IPaymentsService

```typescript
export interface IPaymentsService {
  initiatePayment(userId: string, amount: number, currency: string, method: PaymentMethod): Promise<Payment>;
  processWebhook(data: WebhookData): Promise<void>;
  getPaymentHistory(userId: string, page: number, limit: number): Promise<Payment[]>;
  refund(paymentId: string, reason: string): Promise<Refund>;
  getTransactionStatus(transactionId: string): Promise<PaymentStatus>;
  verifyPayment(transactionId: string): Promise<boolean>;
}
```

### Notifications Module

#### INotificationsService

```typescript
export interface INotificationsService {
  create(data: CreateNotificationDto): Promise<Notification>;
  findById(id: string): Promise<Notification | null>;
  findByUser(userId: string, page: number, limit: number): Promise<Notification[]>;
  markAsRead(id: string, userId: string): Promise<Notification>;
  markAllAsRead(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;
  delete(id: string, userId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
}
```

---

## Internal Interfaces

### Database Interfaces

#### IDatabaseConnection

```typescript
export interface IDatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(query: string, params?: any[]): Promise<any>;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
```

### Cache Interfaces

#### ICacheService

```typescript
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deletePattern(pattern: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  increment(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
}
```

### Event Bus Interfaces

#### IEventBus

```typescript
export interface IEventBus {
  emit(event: Event): Promise<void>;
  on(eventType: string, handler: EventHandler): Promise<void>;
  off(eventType: string, handler: EventHandler): Promise<void>;
}
```

### Email Service Interfaces

#### IEmailService

```typescript
export interface IEmailService {
  send(to: string, subject: string, template: string, data: any): Promise<void>;
  sendWelcome(userId: string): Promise<void>;
  sendVerification(userId: string, token: string): Promise<void>;
  sendPasswordReset(userId: string, token: string): Promise<void>;
  sendNotification(userId: string, notification: Notification): Promise<void>;
}
```

### File Storage Interfaces

#### IFileStorageService

```typescript
export interface IFileStorageService {
  upload(file: Buffer, path: string, contentType: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getSignedUrl(path: string, expiresIn: number): Promise<string>;
}
```

---

## Event Interfaces

### Event Types

```typescript
export enum EventType {
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  STORY_CREATED = 'story.created',
  STORY_UPDATED = 'story.updated',
  STORY_PUBLISHED = 'story.published',
  STORY_DELETED = 'story.deleted',
  COMMENT_CREATED = 'comment.created',
  COMMENT_UPDATED = 'comment.updated',
  COMMENT_DELETED = 'comment.deleted',
  REACTION_ADDED = 'reaction.added',
  REACTION_REMOVED = 'reaction.removed',
  FOLLOW_CREATED = 'follow.created',
  FOLLOW_DELETED = 'follow.deleted',
  NOTIFICATION_CREATED = 'notification.created',
  NOTIFICATION_READ = 'notification.read',
  BOOK_CREATED = 'book.created',
  BOOK_PURCHASED = 'book.purchased',
  BOOK_RENTED = 'book.rented',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  CONTEST_CREATED = 'contest.created',
  CONTEST_SUBMITTED = 'contest.submitted',
  CONTEST_VOTED = 'contest.voted',
  CONTEST_COMPLETED = 'contest.completed'
}
```

### Event Structure

```typescript
export interface Event {
  id: string;
  type: EventType;
  payload: any;
  timestamp: Date;
  userId?: string;
  metadata?: EventMetadata;
}

export interface EventMetadata {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}
```

---

## Dependency Injection

### Module Registration

```typescript
@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    EventBusModule,
    EmailModule,
    StorageModule
  ],
  providers: [
    UsersService,
    UsersRepository,
    {
      provide: 'IUsersService',
      useClass: UsersService
    }
  ],
  exports: [
    'IUsersService',
    UsersService
  ]
})
export class UsersModule {}
```

### Consumer Registration

```typescript
@Module({
  imports: [
    UsersModule,
    EventBusModule
  ],
  providers: [
    StoriesService,
    {
      provide: 'IUsersService',
      useExisting: 'IUsersService'
    }
  ]
})
export class StoriesModule {}
```

---

## Interface Testing

### Mocking Interfaces

```typescript
const mockUsersService = {
  create: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};

describe('StoriesService', () => {
  let service: StoriesService;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StoriesService,
        {
          provide: 'IUsersService',
          useValue: mockUsersService
        }
      ]
    }).compile();
    
    service = module.get<StoriesService>(StoriesService);
  });
});
```

---

## Versioning

### Interface Versioning

- Major version: Breaking changes
- Minor version: New features
- Patch version: Bug fixes

### Compatibility

- Consumers depend on major version
- Providers maintain backward compatibility
- Deprecation warnings for old interfaces
- Migration guides provided

---

*This document defines public interfaces for the Hakawi platform.*
