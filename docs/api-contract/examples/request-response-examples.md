# Request/Response Examples
## Hakawi API Contract

This document provides concrete examples for common API calls and error scenarios in the Hakawi API.

---

## Success Responses

### User Registration
**Request:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "writer@example.com",
  "password": "SecurePass123!",
  "name": "Ahmed Writer",
  "username": "ahmedwrites"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "writer@example.com",
      "name": "Ahmed Writer",
      "username": "ahmedwrites",
      "accountType": "reader",
      "isVerified": false,
      "onboardingCompleted": false
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 900
    }
  },
  "message": "User registered successfully"
}
```

---

### Create Story
**Request:**
```http
POST /api/v1/stories
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "title": "The Art of Arabic Storytelling",
  "content": "<p>In the heart of Cairo, there was once...</p>",
  "category": "fiction",
  "tags": ["arabic", "culture", "tradition"]
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "title": "The Art of Arabic Storytelling",
    "slug": "the-art-of-arabic-storytelling",
    "status": "draft",
    "category": "fiction",
    "tags": ["arabic", "culture", "tradition"],
    "authorId": "550e8400-e29b-41d4-a716-446655440000",
    "wordCount": 0,
    "createdAt": "YYYY-MM-DDTHH:mm:ss.sssZ"
  },
  "message": "Story created successfully"
}
```

---

### Publish Story
**Request:**
```http
POST /api/v1/stories/660e8400-e29b-41d4-a716-446655440001/publish
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "status": "published",
    "publishedAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
    "slug": "the-art-of-arabic-storytelling"
  },
  "message": "Story published successfully"
}
```

---

### Get Published Stories
**Request:**
```http
GET /api/v1/stories?page=1&limit=20&category=fiction&sortBy=date
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "title": "The Art of Arabic Storytelling",
      "slug": "the-art-of-arabic-storytelling",
      "author": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Ahmed Writer",
        "username": "ahmedwrites"
      },
      "category": "fiction",
      "views": 1250,
      "reactions": 45,
      "comments": 12,
      "createdAt": "YYYY-MM-DDTHH:mm:ss.sssZ",
      "publishedAt": "YYYY-MM-DDTHH:mm:ss.sssZ"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Error Responses

### Validation Error
**Request:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "invalid-email",
  "password": "weak",
  "name": "",
  "username": "ab"
}
```

**Response 400:**
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "value": "invalid-email"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters",
      "value": "weak"
    },
    {
      "field": "name",
      "message": "Name must be at least 2 characters",
      "value": ""
    },
    {
      "field": "username",
      "message": "Username must be at least 3 characters",
      "value": "ab"
    }
  ],
  "statusCode": 400,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/auth/register",
  "correlationId": "abc123xyz"
}
```

---

### Unauthorized Error
**Request:**
```http
GET /api/v1/users/me
Authorization: Bearer invalid_token
```

**Response 401:**
```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "Authentication required",
  "code": "AUTH_REQUIRED",
  "statusCode": 401,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/users/me",
  "correlationId": "def456uvw"
}
```

---

### Forbidden Error
**Request:**
```http
DELETE /api/v1/stories/660e8400-e29b-41d4-a716-446655440001
Authorization: Bearer <different_user_token>
```

**Response 403:**
```json
{
  "success": false,
  "error": "FORBIDDEN",
  "message": "You do not have permission to delete this story",
  "code": "INSUFFICIENT_PERMISSIONS",
  "statusCode": 403,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/stories/660e8400-e29b-41d4-a716-446655440001",
  "correlationId": "ghi789rst"
}
```

---

### Not Found Error
**Request:**
```http
GET /api/v1/stories/00000000-0000-0000-0000-000000000000
```

**Response 404:**
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Story not found",
  "code": "RESOURCE_NOT_FOUND",
  "statusCode": 404,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/stories/00000000-0000-0000-0000-000000000000",
  "correlationId": "jkl012uvw"
}
```

---

### Conflict Error
**Request:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "existing@example.com",
  "password": "SecurePass123!",
  "name": "Existing User",
  "username": "existinguser"
}
```

**Response 409:**
```json
{
  "success": false,
  "error": "CONFLICT",
  "message": "Email already exists",
  "code": "EMAIL_ALREADY_EXISTS",
  "statusCode": 409,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/auth/register",
  "correlationId": "mno345xyz"
}
```

---

### Rate Limit Error
**Request:**
```http
POST /api/v1/auth/login
# (After 10 failed attempts)
```

**Response 429:**
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many login attempts. Please try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "statusCode": 429,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/auth/login",
  "correlationId": "pqr678abc",
  "retryAfter": 60
}
```

---

### Internal Server Error
**Request:**
```http
GET /api/v1/stories
# (Database connection fails)
```

**Response 500:**
```json
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred",
  "code": "INTERNAL_SERVER_ERROR",
  "statusCode": 500,
  "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
  "path": "/api/v1/stories",
  "correlationId": "stu901def"
}
```

---

## Common Scenarios

### Paginated List with Filtering
**Request:**
```http
GET /api/v1/stories?page=2&limit=10&category=fiction&authorId=550e8400-e29b-41d4-a716-446655440000&sortBy=views&sortOrder=desc
```

**Response 200:**
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 2,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

### Search with Query
**Request:**
```http
GET /api/v1/search?q=adventure&type=stories&page=1&limit=20
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "stories": [...],
    "authors": [...],
    "categories": [...],
    "total": 25
  }
}
```

---

*This document provides request/response examples for the Hakawi API.*
