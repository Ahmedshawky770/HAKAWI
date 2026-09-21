# Postman Collection
## Hakawi API

This document provides a Postman collection for testing the Hakawi API.

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
│   ├── Get User Profile
│   ├── Update User Profile
│   ├── Follow User
│   ├── Unfollow User
│   ├── Get Followers
│   └── Get Following
├── Stories
│   ├── Get Stories
│   ├── Get Story
│   ├── Create Story
│   ├── Update Story
│   ├── Publish Story
│   └── Delete Story
├── Comments
│   ├── Get Comments
│   ├── Create Comment
│   ├── Update Comment
│   └── Delete Comment
├── Reactions
│   ├── Add Reaction
│   ├── Remove Reaction
│   └── Get Reactions
├── Notifications
│   ├── Get Notifications
│   ├── Mark as Read
│   ├── Mark All as Read
│   └── Get Unread Count
├── Messages
│   ├── Get Conversations
│   ├── Get Messages
│   └── Send Message
├── Books
│   ├── Get Books
│   ├── Create Book
│   ├── Purchase Book
│   └── Rent Book
└── Contests
    ├── Get Contests
    ├── Create Contest
    ├── Submit to Contest
    └── Vote for Submission
```

---

## Environment Variables

### Development

```json
{
  "baseUrl": "http://localhost:3001/api/v1",
  "accessToken": "your_access_token",
  "refreshToken": "your_refresh_token",
  "userId": "your_user_id"
}
```

### Staging

```json
{
  "baseUrl": "https://api-staging.hakawi.com/v1",
  "accessToken": "your_access_token",
  "refreshToken": "your_refresh_token",
  "userId": "your_user_id"
}
```

### Production

```json
{
  "baseUrl": "https://api.hakawi.com/v1",
  "accessToken": "your_access_token",
  "refreshToken": "your_refresh_token",
  "userId": "your_user_id"
}
```

---

## Collection JSON

```json
{
  "info": {
    "name": "Hakawi API",
    "description": "Postman collection for Hakawi API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3001/api/v1"
    },
    {
      "key": "accessToken",
      "value": ""
    },
    {
      "key": "refreshToken",
      "value": ""
    },
    {
      "key": "userId",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/auth/register",
              "host": ["{{baseUrl}}"],
              "path": ["auth", "register"]
            },
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"SecurePass123!\",\n  \"name\": \"Test User\",\n  \"username\": \"testuser\"\n}"
            }
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["auth", "login"]
            },
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"SecurePass123!\"\n}"
            }
          },
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 200) {",
                  "    const jsonData = pm.response.json();",
                  "    pm.environment.set('accessToken', jsonData.token);",
                  "    pm.environment.set('refreshToken', jsonData.refreshToken);",
                  "    pm.environment.set('userId', jsonData.user.id);",
                  "}"
                ]
              }
            }
          ]
        },
        {
          "name": "Refresh Token",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/auth/refresh",
              "host": ["{{baseUrl}}"],
              "path": ["auth", "refresh"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{refreshToken}}"
              }
            ]
          }
        },
        {
          "name": "Logout",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/auth/logout",
              "host": ["{{baseUrl}}"],
              "path": ["auth", "logout"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        }
      ]
    },
    {
      "name": "Users",
      "item": [
        {
          "name": "Get User Profile",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/users/{{userId}}",
              "host": ["{{baseUrl}}"],
              "path": ["users", "{{userId}}"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Update User Profile",
          "request": {
            "method": "PUT",
            "url": {
              "raw": "{{baseUrl}}/users/{{userId}}",
              "host": ["{{baseUrl}}"],
              "path": ["users", "{{userId}}"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Updated Name\",\n  \"bio\": \"Updated bio\"\n}"
            }
          }
        },
        {
          "name": "Follow User",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/users/{{userId}}/follow",
              "host": ["{{baseUrl}}"],
              "path": ["users", "{{userId}}", "follow"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Unfollow User",
          "request": {
            "method": "DELETE",
            "url": {
              "raw": "{{baseUrl}}/users/{{userId}}/follow",
              "host": ["{{baseUrl}}"],
              "path": ["users", "{{userId}}", "follow"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Get Followers",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/users/{{userId}}/followers?page=1&limit=20",
              "host": ["{{baseUrl}}"],
              "path": ["users", "{{userId}}", "followers"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Get Following",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/users/{{userId}}/following?page=1&limit=20",
              "host": ["{{baseUrl}}"],
              "path": ["users", "{{userId}}", "following"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        }
      ]
    },
    {
      "name": "Stories",
      "item": [
        {
          "name": "Get Stories",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/stories?page=1&limit=20",
              "host": ["{{baseUrl}}"],
              "path": ["stories"]
            }
          }
        },
        {
          "name": "Get Story",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}"]
            }
          }
        },
        {
          "name": "Create Story",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/stories",
              "host": ["{{baseUrl}}"],
              "path": ["stories"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"title\": \"My Story\",\n  \"content\": \"<p>Story content</p>\",\n  \"category\": \"fiction\",\n  \"tags\": [\"tag1\", \"tag2\"]\n}"
            }
          }
        },
        {
          "name": "Update Story",
          "request": {
            "method": "PUT",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"title\": \"Updated Title\",\n  \"content\": \"<p>Updated content</p>\"\n}"
            }
          }
        },
        {
          "name": "Publish Story",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}/publish",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}", "publish"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Delete Story",
          "request": {
            "method": "DELETE",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        }
      ]
    },
    {
      "name": "Comments",
      "item": [
        {
          "name": "Get Comments",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}/comments?page=1&limit=20",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}", "comments"]
            }
          }
        },
        {
          "name": "Create Comment",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}/comments",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}", "comments"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"content\": \"Great story!\"\n}"
            }
          }
        },
        {
          "name": "Update Comment",
          "request": {
            "method": "PUT",
            "url": {
              "raw": "{{baseUrl}}/comments/{{commentId}}",
              "host": ["{{baseUrl}}"],
              "path": ["comments", "{{commentId}}"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"content\": \"Updated comment\"\n}"
            }
          }
        },
        {
          "name": "Delete Comment",
          "request": {
            "method": "DELETE",
            "url": {
              "raw": "{{baseUrl}}/comments/{{commentId}}",
              "host": ["{{baseUrl}}"],
              "path": ["comments", "{{commentId}}"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        }
      ]
    },
    {
      "name": "Reactions",
      "item": [
        {
          "name": "Add Reaction",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}/reactions",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}", "reactions"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"type\": \"love\"\n}"
            }
          }
        },
        {
          "name": "Remove Reaction",
          "request": {
            "method": "DELETE",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}/reactions",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}", "reactions"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Get Reactions",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/stories/{{storyId}}/reactions",
              "host": ["{{baseUrl}}"],
              "path": ["stories", "{{storyId}}", "reactions"]
            }
          }
        }
      ]
    },
    {
      "name": "Notifications",
      "item": [
        {
          "name": "Get Notifications",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/notifications?page=1&limit=20",
              "host": ["{{baseUrl}}"],
              "path": ["notifications"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Mark as Read",
          "request": {
            "method": "PATCH",
            "url": {
              "raw": "{{baseUrl}}/notifications/{{notificationId}}/read",
              "host": ["{{baseUrl}}"],
              "path": ["notifications", "{{notificationId}}", "read"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Mark All as Read",
          "request": {
            "method": "POST",
            "url": {
              "raw": "{{baseUrl}}/notifications/read-all",
              "host": ["{{baseUrl}}"],
              "path": ["notifications", "read-all"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        },
        {
          "name": "Get Unread Count",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/notifications/unread-count",
              "host": ["{{baseUrl}}"],
              "path": ["notifications", "unread-count"]
            },
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

---

## Usage Instructions

### Import Collection

1. Open Postman
2. Click "Import" button
3. Select "Raw Text" tab
4. Paste the JSON collection
5. Click "Import"

### Set Environment

1. Click "Environments" in the sidebar
2. Click "Create Environment"
3. Name it "Hakawi Development"
4. Add variables:
   - `baseUrl`: `http://localhost:3001/api/v1`
   - `accessToken`: (leave empty, will be set after login)
   - `refreshToken`: (leave empty, will be set after login)
   - `userId`: (leave empty, will be set after login)
5. Click "Save"
6. Select the environment from the dropdown

### Run Collection

1. Click "Runner" button
2. Select "Hakawi API" collection
3. Select "Hakawi Development" environment
4. Click "Run Hakawi API"

---

*This document provides a Postman collection for testing the Hakawi API.*
