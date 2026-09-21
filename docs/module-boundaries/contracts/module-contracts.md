# Module Contracts
## Hakawi Module Boundaries

This document defines the public API contracts for each module, including HTTP endpoints, DTOs, event contracts, and cross-module communication protocols.

---

## Contract Principles

1. **Explicit Interfaces** - All module interactions through well-defined interfaces
2. **Versioned Contracts** - API versions for backward compatibility
3. **Event Contracts** - Typed event payloads for async communication
4. **DTO Validation** - All inputs validated with Zod schemas
5. **Error Contracts** - Standardized error response format

---

## Auth Module Contracts

### HTTP Endpoints

#### POST /auth/register
**Description:** Register a new user

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "username": "johndoe"
}
```

**Response 201:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "accountType": "reader"
  },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Validation Rules:**
- Email: Valid email format, unique
- Password: Min 8 chars, must contain uppercase, lowercase, number, special char
- Name: Min 2 chars, max 100 chars
- Username: Alphanumeric, min 3 chars, max 30 chars, unique

---

#### POST /auth/login
**Description:** Login user

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response 200:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "accountType": "reader"
  },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Error Responses:**
- 401: Invalid credentials
- 403: Account locked
- 423: MFA required

---

### Event Contracts

#### UserRegisteredEvent
```typescript
interface UserRegisteredEvent {
  aggregateId: string; // user ID
  aggregateType: 'user';
  eventType: 'user.registered';
  occurredAt: Date;
  payload: {
    userId: string;
    email: string;
    username: string;
    accountType: string;
  };
}
```

#### UserLoggedInEvent
```typescript
interface UserLoggedInEvent {
  aggregateId: string; // user ID
  aggregateType: 'user';
  eventType: 'user.logged_in';
  occurredAt: Date;
  payload: {
    userId: string;
    ipAddress: string;
    userAgent: string;
    method: 'oauth' | 'email';
  };
}
```

---

## Users Module Contracts

### HTTP Endpoints

#### GET /users/:id
**Description:** Get user profile

**Response 200:**
```json
{
  "id": "uuid",
  "username": "johndoe",
  "name": "John Doe",
  "avatar": "https://...",
  "bio": "Writer and storyteller",
  "accountType": "writer",
  "isVerified": true,
  "stats": {
    "storiesCount": 12,
    "followersCount": 150,
    "followingCount": 45,
    "totalViews": 15000,
    "totalReactions": 450
  }
}
```

#### PATCH /users/:id
**Description:** Update user profile

**Request:**
```json
{
  "name": "John Doe Updated",
  "bio": "New bio",
  "avatar": "https://..."
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "name": "John Doe Updated",
  "bio": "New bio",
  "avatar": "https://..."
}
```

**Error Responses:**
- 403: Cannot update other user's profile
- 409: Username already taken
- 422: Validation error

---

### Event Contracts

#### UserUpdatedEvent
```typescript
interface UserUpdatedEvent {
  aggregateId: string;
  aggregateType: 'user';
  eventType: 'user.updated';
  occurredAt: Date;
  payload: {
    userId: string;
    updatedFields: string[];
    updatedBy: string;
  };
}
```

---

## Stories Module Contracts

### HTTP Endpoints

#### GET /stories/:id
**Description:** Get story by ID

**Response 200:**
```json
{
  "id": "uuid",
  "sanityStoryId": "sanity_123",
  "authorId": "uuid",
  "title": "The Beginning",
  "slug": "the-beginning",
  "description": "Once upon a time...",
  "coverImage": "https://...",
  "status": "published",
  "wordCount": 2500,
  "readingTime": 10,
  "views": 1200,
  "reactions": 45,
  "comments": 12,
  "category": "fiction",
  "tags": ["adventure", "mystery"],
  "author": {
    "id": "uuid",
    "name": "John Doe",
    "username": "johndoe",
    "avatar": "https://..."
  },
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
  "publishedAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

#### POST /stories
**Description:** Create new story

**Request:**
```json
{
  "title": "My New Story",
  "content": "<p>Once upon a time...</p>",
  "category": "fiction",
  "tags": ["adventure", "mystery"]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "title": "My New Story",
  "status": "draft",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

### Event Contracts

#### StoryPublishedEvent
```typescript
interface StoryPublishedEvent {
  aggregateId: string; // story ID
  aggregateType: 'story';
  eventType: 'story.published';
  occurredAt: Date;
  payload: {
    storyId: string;
    authorId: string;
    title: string;
    slug: string;
    category: string;
  };
}
```

---

## Books Module Contracts

### HTTP Endpoints

#### POST /books/:id/purchase
**Description:** Purchase a book

**Request:**
```json
{
  "paymentMethodId": "pm_123456"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "bookId": "uuid",
  "buyerId": "uuid",
  "salePrice": 29.99,
  "currency": "SAR",
  "saleType": "digital",
  "purchasedAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

**Error Responses:**
- 403: Cannot purchase own book
- 409: Already purchased
- 422: Book not available

---

## Contests Module Contracts

### HTTP Endpoints

#### POST /contests
**Description:** Create new contest (publisher only)

**Request:**
```json
{
  "title": "Short Story Contest 2024",
  "description": "Write a short story about...",
  "theme": "Adventure",
  "category": "fiction",
  "startDate": "YYYY-MM-DDTHH:mm:ssZ",
  "endDate": "YYYY-MM-DDTHH:mm:ssZ",
  "submissionDeadline": "YYYY-MM-DDTHH:mm:ssZ",
  "prizeType": "cash",
  "prizeValue": "1000",
  "rules": "Original content only...",
  "minWordCount": 1000,
  "maxWordCount": 10000,
  "allowedGenres": ["fiction", "adventure"]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "title": "Short Story Contest 2024",
  "status": "draft",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Error Response Contract

### Standard Format
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "value": "invalid-email"
    }
  ],
  "statusCode": 400,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/auth/register",
  "correlationId": "abc123"
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Contract Versioning

### URL Versioning
```
/v1/auth/register
/v1/users/:id
/v1/stories
```

### Header Versioning (Alternative)
```
Accept: application/vnd.hakawi.v1+json
```

### Deprecation Policy
- Old versions supported for 6 months
- Deprecation warnings in response headers
- Migration guide provided

---

*This document defines the module contracts for Hakawi.*
