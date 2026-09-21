# Shared Interfaces
## Hakawi Module Boundaries

This document defines shared TypeScript interfaces, base classes, DTOs, and cross-cutting abstractions used across all Hakawi modules.

---

## Base Interfaces

### Entity Interface
```typescript
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### Repository Interface
```typescript
interface IRepository<T extends BaseEntity> {
  findById(id: string): Promise<T | null>;
  findAll(options?: FindOptions): Promise<T[]>;
  create(data: CreateDto<T>): Promise<T>;
  update(id: string, data: UpdateDto<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

### Service Interface
```typescript
interface IService<T> {
  findById(id: string): Promise<T | null>;
  findAll(options?: FindOptions): Promise<T[]>;
  create(data: CreateDto<T>): Promise<T>;
  update(id: string, data: UpdateDto<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

---

## Common DTOs

### Pagination DTO
```typescript
class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  get offset(): number {
    return (this.page - 1) * this.limit;
  }
}
```

### Sort DTO
```typescript
class SortDto {
  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

### Date Range DTO
```typescript
class DateRangeDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
```

### Response DTOs
```typescript
class ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

---

## Domain Interfaces

### User Interfaces
```typescript
interface IUser extends BaseEntity {
  id: string;
  googleId?: string;
  facebookId?: string;
  twitterId?: string;
  githubId?: string;
  appleId?: string;
  tiktokId?: string;
  username: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  accountType: AccountType;
  adminRole?: AdminRole;
  isVerified: boolean;
  onboardingCompleted: boolean;
  accessBlocked: boolean;
}

interface IUserProfile extends BaseEntity {
  userId: string;
  location?: string;
  country?: string;
  website?: string;
  socialLinks: Record<string, string>;
  phoneNumber?: string;
  age?: number;
}

interface IUserStats {
  storiesCount: number;
  totalViews: number;
  totalReactions: number;
  followersCount: number;
  followingCount: number;
}
```

### Story Interfaces
```typescript
interface IStory extends BaseEntity {
  id: string;
  sanityStoryId: string;
  authorId: string;
  title: string;
  slug: string;
  description?: string;
  coverImage?: string;
  status: StoryStatus;
  wordCount: number;
  readingTime: number;
  views: number;
  reactions: number;
  comments: number;
  category: string;
  tags: string[];
}

interface IStoryCreate {
  title: string;
  content: string;
  category: string;
  tags?: string[];
}

interface IStoryUpdate extends Partial<IStoryCreate> {
  status?: StoryStatus;
}
```

### Book Interfaces
```typescript
interface IBook extends BaseEntity {
  id: string;
  ownerId: string;
  title: string;
  subtitle?: string;
  authorName: string;
  coverImage?: string;
  pdfUrl: string;
  pdfPages: number;
  price: number;
  isAvailable: boolean;
}

interface IBookSale extends BaseEntity {
  id: string;
  bookId: string;
  sellerId: string;
  buyerId: string;
  salePrice: number;
  currency: string;
  saleType: 'digital' | 'physical';
  purchasedAt: Date;
}

interface IBookRental extends BaseEntity {
  id: string;
  bookId: string;
  renterId: string;
  rentalDuration: RentalDuration;
  rentalPrice: number;
  platformCommission: number;
  ownerEarnings: number;
  status: RentalStatus;
  startDate: Date;
  endDate: Date;
  extensionCount: number;
}
```

### Contest Interfaces
```typescript
interface IContest extends BaseEntity {
  id: string;
  publisherId: string;
  title: string;
  description: string;
  theme?: string;
  category: string;
  participantType: string;
  status: ContestStatus;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
  prizeType: PrizeType;
  prizeValue?: string;
  prizeDescription?: string;
  rules: string;
  minWordCount: number;
  maxWordCount: number;
}

interface IContestSubmission extends BaseEntity {
  id: string;
  contestId: string;
  authorId: string;
  storyId: string;
  status: SubmissionStatus;
  submittedAt: Date;
  reviewNotes?: string;
  finalRank?: number;
  votesCount: number;
}
```

---

## Event Interfaces

### Base Event
```typescript
interface BaseEvent {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}
```

### Domain Events
```typescript
type DomainEvent = 
  | UserRegisteredEvent
  | UserUpdatedEvent
  | UserVerifiedEvent
  | StoryCreatedEvent
  | StoryUpdatedEvent
  | StoryPublishedEvent
  | BookPurchasedEvent
  | BookRentedEvent
  | ContestCreatedEvent
  | ContestEndedEvent
  | NotificationCreatedEvent
  | MessageSentEvent;
```

---

## Utility Types

### Result Type
```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

### Maybe Type
```typescript
type Maybe<T> = T | null | undefined;
```

### Deep Partial
```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

### ID Types
```typescript
type UserId = string;
type StoryId = string;
type BookId = string;
type ContestId = string;
type NotificationId = string;
type MessageId = string;
```

---

## Cross-Cutting Concerns

### Logger Interface
```typescript
interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}
```

### Cache Interface
```typescript
interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPattern(pattern: string): Promise<number>;
  invalidateTag(tag: string): Promise<void>;
}
```

### Event Bus Interface
```typescript
interface IEventBus {
  publish(event: BaseEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}
```

---

## Type Guards

```typescript
function isUser(obj: unknown): obj is IUser {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'email' in obj;
}

function isStory(obj: unknown): obj is IStory {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'title' in obj;
}

function isError(error: unknown): error is Error {
  return error instanceof Error;
}
```

---

## Constants

### HTTP Status Codes
```typescript
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_SERVER_ERROR: 500
} as const;
```

### Cache Keys
```typescript
const CACHE_KEYS = {
  USER: (id: string) => `user:${id}`,
  STORY: (id: string) => `story:${id}`,
  USER_STORIES: (userId: string) => `user:${userId}:stories`,
  NOTIFICATIONS: (userId: string) => `user:${userId}:notifications`
} as const;
```

---

*This document defines shared interfaces for Hakawi.*
