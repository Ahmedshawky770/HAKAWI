# API Contract
## Hakawi - REST API Specification

---

## API Overview

- **Base URL:** `https://api.hakawi.com/v1`
- **Authentication:** Bearer JWT tokens
- **Format:** JSON
- **Versioning:** URL path (`/v1/`)

---

## Authentication

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "username": "johndoe"
}

Response 201:
{
  "user": { "id": "uuid", "email": "user@example.com", "name": "John Doe" },
  "token": { "accessToken": "...", "refreshToken": "..." }
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response 200:
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "token": { "accessToken": "...", "refreshToken": "..." }
}
```

### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "..."
}

Response 200:
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

## Users

### Get User Profile
```http
GET /users/:id
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "username": "johndoe",
  "name": "John Doe",
  "avatar": "https://...",
  "bio": "Writer and storyteller",
  "accountType": "writer",
  "stats": {
    "storiesCount": 12,
    "followersCount": 150,
    "followingCount": 45
  }
}
```

### Update User Profile
```http
PATCH /users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe Updated",
  "bio": "New bio"
}

Response 200:
{
  "id": "uuid",
  "name": "John Doe Updated",
  "bio": "New bio"
}
```

---

## Stories

### List Stories
```http
GET /stories?page=1&limit=20&category=fiction
Authorization: Bearer <token>

Response 200:
{
  "stories": [
    {
      "id": "uuid",
      "title": "The Beginning",
      "slug": "the-beginning",
      "author": { "id": "uuid", "name": "John Doe" },
      "category": "fiction",
      "views": 1200,
      "reactions": 45,
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### Create Story
```http
POST /stories
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "My New Story",
  "content": "<p>Once upon a time...</p>",
  "category": "fiction",
  "tags": ["adventure", "mystery"]
}

Response 201:
{
  "id": "uuid",
  "title": "My New Story",
  "status": "draft",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Books

### Purchase Book
```http
POST /books/:id/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethodId": "pm_123456"
}

Response 201:
{
  "id": "uuid",
  "bookId": "uuid",
  "buyerId": "uuid",
  "salePrice": 29.99,
  "purchasedAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

### Rent Book
```http
POST /books/:id/rent
Authorization: Bearer <token>
Content-Type: application/json

{
  "duration": "one_week",
  "paymentMethodId": "pm_123456"
}

Response 201:
{
  "id": "uuid",
  "bookId": "uuid",
  "renterId": "uuid",
  "rentalPrice": 9.99,
  "startDate": "YYYY-MM-DDTHH:mm:ssZ",
  "endDate": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Contests

### Create Contest
```http
POST /contests
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Short Story Contest",
  "description": "Write a short story about...",
  "category": "fiction",
  "startDate": "YYYY-MM-DDTHH:mm:ssZ",
  "endDate": "YYYY-MM-DDTHH:mm:ssZ",
  "submissionDeadline": "YYYY-MM-DDTHH:mm:ssZ",
  "prizeType": "cash",
  "prizeValue": "1000",
  "rules": "Original content only..."
}

Response 201:
{
  "id": "uuid",
  "title": "Short Story Contest",
  "status": "draft",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

### Submit Entry
```http
POST /contests/:id/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "storyId": "uuid"
}

Response 201:
{
  "id": "uuid",
  "contestId": "uuid",
  "authorId": "uuid",
  "storyId": "uuid",
  "status": "pending",
  "submittedAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Notifications

### Get Notifications
```http
GET /notifications?page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "notifications": [
    {
      "id": "uuid",
      "type": "follow",
      "title": "New Follower",
      "message": "John Doe started following you",
      "isRead": false,
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "unreadCount": 5
}
```

### Mark as Read
```http
PATCH /notifications/:id/read
Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "isRead": true,
  "readAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Messages

### Get Conversations
```http
GET /messages/conversations
Authorization: Bearer <token>

Response 200:
{
  "conversations": [
    {
      "id": "uuid",
      "participant": {
        "id": "uuid",
        "name": "Jane Doe",
        "avatar": "https://..."
      },
      "lastMessage": {
        "content": "Hello!",
        "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
      },
      "unreadCount": 2
    }
  ]
}
```

### Send Message
```http
POST /messages/conversations/:id/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello, how are you?"
}

Response 201:
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderId": "uuid",
  "content": "Hello, how are you?",
  "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "statusCode": 400
}
```

### Common Error Codes
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

## Rate Limiting

- **Default:** 100 requests per minute per user
- **Auth endpoints:** 10 requests per minute per IP
- **Upload endpoints:** 5 requests per minute per user

---

## Versioning

- **Current Version:** v1
- **URL Path:** `/v1/`
- **Deprecation:** 6 months notice
- **Changelog:** `/v1/changelog`

---

*This document defines the REST API contract for Hakawi.*
