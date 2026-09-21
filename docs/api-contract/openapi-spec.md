# API Contract
## Hakawi API Specification

This document defines the complete API contract for the Hakawi platform.

---

## Base URL

```
Production: https://api.hakawi.com/v1
Staging: https://api-staging.hakawi.com/v1
Development: http://localhost:3001/api/v1
```

---

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Token Refresh

```
POST /auth/refresh
Authorization: Bearer <refresh_token>
```

---

## Users API

### Register User

```
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "username": "johndoe"
}
```

**Response (201 Created):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "avatar": null,
    "bio": null,
    "role": "reader",
    "verified": false,
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  },
  "token": "access_token",
  "refreshToken": "refresh_token"
}
```

### Login

```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "role": "reader",
    "verified": true
  },
  "token": "access_token",
  "refreshToken": "refresh_token"
}
```

### Get User Profile

```
GET /users/:id
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg",
    "bio": "Writer and storyteller",
    "role": "writer",
    "verified": true,
    "stats": {
      "stories": 42,
      "followers": 1337,
      "following": 500,
      "totalViews": 50000
    },
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Update User Profile

```
PUT /users/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "John Doe",
  "bio": "Updated bio",
  "avatar": "base64_image_data"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "bio": "Updated bio",
    "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
  }
}
```

### Follow User

```
POST /users/:id/follow
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "follow": {
    "id": "uuid",
    "followerId": "uuid",
    "followingId": "uuid",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Unfollow User

```
DELETE /users/:id/follow
Authorization: Bearer <token>
```

**Response (204 No Content)**

### Get Followers

```
GET /users/:id/followers?page=1&limit=20
```

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "Follower Name",
      "username": "follower",
      "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1337,
    "totalPages": 67
  }
}
```

### Get Following

```
GET /users/:id/following?page=1&limit=20
```

**Response (200 OK):**
```json
{
  "users": [...],
  "pagination": {...}
}
```

---

## Stories API

### Get Stories

```
GET /stories?page=1&limit=20&category=fiction&q=search
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `category` (optional): Category filter
- `author` (optional): Author username filter
- `q` (optional): Search query
- `sort` (optional): Sort by `latest`, `popular`, `trending` (default: `latest`)

**Response (200 OK):**
```json
{
  "stories": [
    {
      "id": "uuid",
      "title": "Story Title",
      "excerpt": "Short excerpt...",
      "category": "fiction",
      "author": {
        "id": "uuid",
        "name": "Author Name",
        "username": "author",
        "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
      },
      "stats": {
        "views": 1000,
        "reactions": 42,
        "comments": 10
      },
      "publishedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Get Story

```
GET /stories/:id
```

**Response (200 OK):**
```json
{
  "story": {
    "id": "uuid",
    "title": "Story Title",
    "content": "<p>Full content...</p>",
    "category": "fiction",
    "tags": ["tag1", "tag2"],
    "author": {
      "id": "uuid",
      "name": "Author Name",
      "username": "author",
      "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
    },
    "stats": {
      "views": 1000,
      "reactions": {
        "love": 10,
        "like": 20,
        "clap": 12
      },
      "comments": 10,
      "shares": 5
    },
    "publishedAt": "YYYY-MM-DDTHH:mm:ssZ",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
    "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Create Story

```
POST /stories
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Story Title",
  "content": "<p>Story content...</p>",
  "category": "fiction",
  "tags": ["tag1", "tag2"],
  "status": "draft"
}
```

**Response (201 Created):**
```json
{
  "story": {
    "id": "uuid",
    "title": "Story Title",
    "content": "<p>Story content...</p>",
    "category": "fiction",
    "tags": ["tag1", "tag2"],
    "status": "draft",
    "authorId": "uuid",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Update Story

```
PUT /stories/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "<p>Updated content...</p>",
  "category": "fiction",
  "tags": ["tag1", "tag2"]
}
```

**Response (200 OK):**
```json
{
  "story": {
    "id": "uuid",
    "title": "Updated Title",
    "content": "<p>Updated content...</p>",
    "category": "fiction",
    "tags": ["tag1", "tag2"],
    "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Publish Story

```
POST /stories/:id/publish
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "story": {
    "id": "uuid",
    "title": "Story Title",
    "status": "published",
    "publishedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Delete Story

```
DELETE /stories/:id
Authorization: Bearer <token>
```

**Response (204 No Content)**

---

## Comments API

### Get Comments

```
GET /stories/:id/comments?page=1&limit=20
```

**Response (200 OK):**
```json
{
  "comments": [
    {
      "id": "uuid",
      "content": "Great story!",
      "author": {
        "id": "uuid",
        "name": "Commenter Name",
        "username": "commenter",
        "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
      },
      "replies": [],
      "stats": {
        "reactions": 5,
        "replies": 2
      },
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "totalPages": 1
  }
}
```

### Create Comment

```
POST /stories/:id/comments
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "content": "Great story!",
  "parentId": "uuid" // optional, for replies
}
```

**Response (201 Created):**
```json
{
  "comment": {
    "id": "uuid",
    "content": "Great story!",
    "authorId": "uuid",
    "storyId": "uuid",
    "parentId": null,
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Update Comment

```
PUT /comments/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "content": "Updated comment"
}
```

**Response (200 OK):**
```json
{
  "comment": {
    "id": "uuid",
    "content": "Updated comment",
    "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Delete Comment

```
DELETE /comments/:id
Authorization: Bearer <token>
```

**Response (204 No Content)**

---

## Reactions API

### Add Reaction

```
POST /stories/:id/reactions
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "type": "love"
}
```

**Reaction Types:** `love`, `like`, `clap`, `insightful`, `funny`, `sad`

**Response (200 OK):**
```json
{
  "reaction": {
    "id": "uuid",
    "userId": "uuid",
    "storyId": "uuid",
    "type": "love",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Remove Reaction

```
DELETE /stories/:id/reactions
Authorization: Bearer <token>
```

**Response (204 No Content)**

### Get Reactions

```
GET /stories/:id/reactions
```

**Response (200 OK):**
```json
{
  "reactions": [
    {
      "id": "uuid",
      "type": "love",
      "user": {
        "id": "uuid",
        "name": "User Name",
        "username": "username"
      },
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "counts": {
    "love": 10,
    "like": 20,
    "clap": 12,
    "insightful": 5,
    "funny": 3,
    "sad": 2
  }
}
```

---

## Notifications API

### Get Notifications

```
GET /notifications?page=1&limit=20&unread=true
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "follow",
      "actor": {
        "id": "uuid",
        "name": "Actor Name",
        "username": "actor",
        "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
      },
      "entity": {
        "type": "story",
        "id": "uuid",
        "title": "Story Title"
      },
      "read": false,
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### Mark as Read

```
PATCH /notifications/:id/read
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "notification": {
    "id": "uuid",
    "read": true,
    "readAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Mark All as Read

```
POST /notifications/read-all
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

### Get Unread Count

```
GET /notifications/unread-count
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "count": 42
}
```

---

## Messages API

### Get Conversations

```
GET /messages/conversations
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "participant": {
        "id": "uuid",
        "name": "Participant Name",
        "username": "participant",
        "avatar": "https://cdn.hakawi.com/avatars/uuid.jpg"
      },
      "lastMessage": {
        "id": "uuid",
        "content": "Hello!",
        "senderId": "uuid",
        "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
      },
      "unreadCount": 2,
      "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ]
}
```

### Get Messages

```
GET /messages/conversations/:id/messages?page=1&limit=50
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "messages": [
    {
      "id": "uuid",
      "content": "Hello!",
      "senderId": "uuid",
      "recipientId": "uuid",
      "read": true,
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

### Send Message

```
POST /messages/conversations/:id/messages
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "content": "Hello!"
}
```

**Response (201 Created):**
```json
{
  "message": {
    "id": "uuid",
    "content": "Hello!",
    "senderId": "uuid",
    "recipientId": "uuid",
    "read": false,
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

---

## Books API

### Get Books

```
GET /books?page=1&limit=20&category=fiction&q=search
```

**Response (200 OK):**
```json
{
  "books": [
    {
      "id": "uuid",
      "title": "Book Title",
      "description": "Book description",
      "coverUrl": "https://cdn.hakawi.com/books/uuid.jpg",
      "price": 9.99,
      "author": {
        "id": "uuid",
        "name": "Author Name",
        "username": "author"
      },
      "stats": {
        "sales": 100,
        "rentals": 50,
        "rating": 4.5
      },
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### Create Book

```
POST /books
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:**
```
title: "Book Title"
description: "Book description"
price: 9.99
category: "fiction"
pdf: @book.pdf
cover: @cover.jpg
```

**Response (201 Created):**
```json
{
  "book": {
    "id": "uuid",
    "title": "Book Title",
    "description": "Book description",
    "coverUrl": "https://cdn.hakawi.com/books/uuid.jpg",
    "pdfUrl": "https://cdn.hakawi.com/books/uuid.pdf",
    "price": 9.99,
    "authorId": "uuid",
    "status": "draft",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Purchase Book

```
POST /books/:id/purchase
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "purchase": {
    "id": "uuid",
    "userId": "uuid",
    "bookId": "uuid",
    "price": 9.99,
    "paymentMethod": "card",
    "status": "completed",
    "purchasedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Rent Book

```
POST /books/:id/rent
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "duration": "one_week"
}
```

**Duration Options:** `one_day`, `one_week`, `one_month`, `three_months`

**Response (200 OK):**
```json
{
  "rental": {
    "id": "uuid",
    "userId": "uuid",
    "bookId": "uuid",
    "duration": "one_week",
    "expiresAt": "YYYY-MM-DDTHH:mm:ssZ",
    "status": "active",
    "rentedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

---

## Contests API

### Get Contests

```
GET /contests?page=1&limit=20&status=active
```

**Response (200 OK):**
```json
{
  "contests": [
    {
      "id": "uuid",
      "title": "Contest Title",
      "description": "Contest description",
      "category": "fiction",
      "status": "active",
      "prize": {
        "amount": 1000,
        "currency": "EGP",
        "type": "cash"
      },
      "timeline": {
        "startDate": "YYYY-MM-DDTHH:mm:ssZ",
        "endDate": "YYYY-MM-DDTHH:mm:ssZ",
        "submissionDeadline": "YYYY-MM-DDTHH:mm:ssZ"
      },
      "stats": {
        "submissions": 50,
        "votes": 200
      },
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "totalPages": 1
  }
}
```

### Create Contest

```
POST /contests
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Contest Title",
  "description": "Contest description",
  "category": "fiction",
  "prize": {
    "amount": 1000,
    "currency": "EGP",
    "type": "cash"
  },
  "rules": "Contest rules...",
  "timeline": {
    "startDate": "YYYY-MM-DDTHH:mm:ssZ",
    "endDate": "YYYY-MM-DDTHH:mm:ssZ",
    "submissionDeadline": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

**Response (201 Created):**
```json
{
  "contest": {
    "id": "uuid",
    "title": "Contest Title",
    "status": "draft",
    "publisherId": "uuid",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Submit to Contest

```
POST /contests/:id/submit
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "storyId": "uuid"
}
```

**Response (201 Created):**
```json
{
  "submission": {
    "id": "uuid",
    "contestId": "uuid",
    "storyId": "uuid",
    "authorId": "uuid",
    "status": "pending",
    "submittedAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

### Vote for Submission

```
POST /contests/:id/vote
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "submissionId": "uuid"
}
```

**Response (200 OK):**
```json
{
  "vote": {
    "id": "uuid",
    "contestId": "uuid",
    "submissionId": "uuid",
    "userId": "uuid",
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  }
}
```

---

## Error Responses

### Standard Error Format

```json
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
  "path": "/api/v1/auth/register"
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid input |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Resource already exists |
| 429 | RATE_LIMIT_EXCEEDED | Too many requests |
| 500 | INTERNAL_ERROR | Server error |

---

## Pagination

### Request

```
GET /stories?page=2&limit=20
```

### Response

```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": true
  }
}
```

---

## Filtering

### Request

```
GET /stories?category=fiction&author=johndoe&status=published&sort=latest
```

### Response

Same as normal response, filtered according to query parameters.

---

## Sorting

### Request

```
GET /stories?sort=latest
GET /stories?sort=popular
GET /stories?sort=trending
```

### Response

Sorted according to sort parameter.

---

*This document defines the complete API contract for the Hakawi platform.*
