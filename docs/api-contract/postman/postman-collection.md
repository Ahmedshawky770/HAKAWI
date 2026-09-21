# Postman Collection
## Hakawi API Contract

This document defines the Postman collection for testing the Hakawi API. It includes requests for all major workflows.

---

## Collection Structure

```
Hakawi API
├── Authentication
│   ├── Register
│   ├── Login
│   ├── Refresh Token
│   └── Logout
├── Users
│   ├── Get Profile
│   ├── Update Profile
│   └── Get User Stats
├── Stories
│   ├── List Stories
│   ├── Get Story
│   ├── Create Story
│   ├── Update Story
│   └── Delete Story
├── Books
│   ├── List Books
│   ├── Get Book
│   ├── Purchase Book
│   └── Rent Book
├── Contests
│   ├── List Contests
│   ├── Get Contest
│   ├── Create Contest
│   ├── Submit Entry
│   └── Vote
├── Notifications
│   ├── Get Notifications
│   ├── Mark as Read
│   └── Get Preferences
├── Messages
│   ├── Get Conversations
│   ├── Get Messages
│   └── Send Message
└── Admin
    ├── Get Reports
    ├── Moderate Content
    └── Block User
```

---

## Environment Variables

```json
{
  "baseUrl": "http://localhost:3000/api/v1",
  "accessToken": "",
  "refreshToken": "",
  "userId": "",
  "storyId": "",
  "bookId": "",
  "contestId": ""
}
```

---

## Authentication Requests

### Register
```json
{
  "name": "POST",
  "url": "{{baseUrl}}/auth/register",
  "body": {
    "email": "test@example.com",
    "password": "TestPass123!",
    "name": "Test User",
    "username": "testuser"
  }
}
```

### Login
```json
{
  "name": "POST",
  "url": "{{baseUrl}}/auth/login",
  "body": {
    "email": "test@example.com",
    "password": "TestPass123!"
  }
}
```

---

## Users Requests

### Get Profile
```json
{
  "name": "GET",
  "url": "{{baseUrl}}/users/{{userId}}",
  "headers": {
    "Authorization": "Bearer {{accessToken}}"
  }
}
```

### Update Profile
```json
{
  "name": "PATCH",
  "url": "{{baseUrl}}/users/{{userId}}",
  "headers": {
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
    "name": "Updated Name",
    "bio": "Updated bio"
  }
}
```

---

## Stories Requests

### List Stories
```json
{
  "name": "GET",
  "url": "{{baseUrl}}/stories?page=1&limit=20&category=fiction"
}
```

### Get Story
```json
{
  "name": "GET",
  "url": "{{baseUrl}}/stories/{{storyId}}"
}
```

### Create Story
```json
{
  "name": "POST",
  "url": "{{baseUrl}}/stories",
  "headers": {
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
    "title": "My New Story",
    "content": "<p>Once upon a time...</p>",
    "category": "fiction",
    "tags": ["adventure", "mystery"]
  }
}
```

---

## Books Requests

### Purchase Book
```json
{
  "name": "POST",
  "url": "{{baseUrl}}/books/{{bookId}}/purchase",
  "headers": {
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
    "paymentMethodId": "pm_123456"
  }
}
```

---

## Contests Requests

### Create Contest
```json
{
  "name": "POST",
  "url": "{{baseUrl}}/contests",
  "headers": {
    "Authorization": "Bearer {{accessToken}}"
  },
  "body": {
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
}
```

---

## Test Scripts

### Store Auth Token
```javascript
const response = pm.response.json();
if (response.tokens) {
  pm.environment.set('accessToken', response.tokens.accessToken);
  pm.environment.set('refreshToken', response.tokens.refreshToken);
}
```

### Validate Response
```javascript
pm.test('Status code is 200', () => {
  pm.response.to.have.status(200);
});

pm.test('Response has data', () => {
  const json = pm.response.json();
  pm.expect(json.data).to.exist;
});
```

---

*This document defines the Postman collection for Hakawi API testing.*
