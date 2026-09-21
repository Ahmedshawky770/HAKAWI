# API Examples
## Hakawi API

This document provides practical examples of using the Hakawi API.

---

## Authentication Examples

### Register a New User

**Request:**
```bash
curl -X POST https://api.hakawi.com/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "writer@example.com",
    "password": "SecurePass123!",
    "name": "Ahmed Writer",
    "username": "ahmedwriter"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "writer@example.com",
    "name": "Ahmed Writer",
    "username": "ahmedwriter",
    "role": "reader",
    "verified": false,
    "createdAt": "YYYY-MM-DDTHH:mm:ssZ"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login

**Request:**
```bash
curl -X POST https://api.hakawi.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "writer@example.com",
    "password": "SecurePass123!"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "writer@example.com",
    "name": "Ahmed Writer",
    "username": "ahmedwriter",
    "role": "writer",
    "verified": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## JavaScript/TypeScript Examples

### Using Fetch API

```typescript
const API_BASE = 'https://api.hakawi.com/v1';

class HakawiAPI {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401 && this.refreshToken) {
      // Try to refresh token
      await this.refreshAccessToken();
      return this.request(endpoint, options);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  private async refreshAccessToken() {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.refreshToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      this.accessToken = data.token;
      this.refreshToken = data.refreshToken;
    } else {
      // Redirect to login
      window.location.href = '/login';
    }
  }

  // Stories
  async getStories(page = 1, limit = 20) {
    return this.request(`/stories?page=${page}&limit=${limit}`);
  }

  async getStory(id: string) {
    return this.request(`/stories/${id}`);
  }

  async createStory(data: { title: string; content: string; category: string }) {
    return this.request('/stories', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Comments
  async getComments(storyId: string, page = 1, limit = 20) {
    return this.request(`/stories/${storyId}/comments?page=${page}&limit=${limit}`);
  }

  async createComment(storyId: string, content: string, parentId?: string) {
    return this.request(`/stories/${storyId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId })
    });
  }

  // Reactions
  async addReaction(storyId: string, type: 'love' | 'like' | 'clap') {
    return this.request(`/stories/${storyId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ type })
    });
  }

  async removeReaction(storyId: string) {
    return this.request(`/stories/${storyId}/reactions`, {
      method: 'DELETE'
    });
  }

  // Follows
  async follow(userId: string) {
    return this.request(`/users/${userId}/follow`, {
      method: 'POST'
    });
  }

  async unfollow(userId: string) {
    return this.request(`/users/${userId}/follow`, {
      method: 'DELETE'
    });
  }

  // Notifications
  async getNotifications(page = 1, limit = 20) {
    return this.request(`/notifications?page=${page}&limit=${limit}`);
  }

  async markAsRead(notificationId: string) {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PATCH'
    });
  }
}

// Usage
const api = new HakawiAPI();

// Get stories
const stories = await api.getStories(1, 20);
console.log(stories);

// Create a story
const story = await api.createStory({
  title: 'My First Story',
  content: '<p>Story content</p>',
  category: 'fiction'
});
console.log(story);
```

---

## React Examples

### Using TanStack Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HakawiAPI } from './hakawi-api';

const api = new HakawiAPI();

// Get stories
function useStories(page = 1) {
  return useQuery({
    queryKey: ['stories', page],
    queryFn: () => api.getStories(page)
  });
}

// Get story
function useStory(id: string) {
  return useQuery({
    queryKey: ['stories', id],
    queryFn: () => api.getStory(id),
    enabled: !!id
  });
}

// Create story
function useCreateStory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { title: string; content: string; category: string }) =>
      api.createStory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    }
  });
}

// Add reaction
function useAddReaction(storyId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (type: 'love' | 'like' | 'clap') =>
      api.addReaction(storyId, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', storyId] });
    }
  });
}

// Component usage
function StoryList() {
  const { data: stories, isLoading } = useStories(1);
  const createStory = useCreateStory();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {stories?.stories.map(story => (
        <StoryCard key={story.id} story={story} />
      ))}
      <button onClick={() => createStory.mutate({
        title: 'New Story',
        content: '<p>Content</p>',
        category: 'fiction'
      })}>
        Create Story
      </button>
    </div>
  );
}
```

---

## Python Examples

### Using Requests

```python
import requests

API_BASE = 'https://api.hakawi.com/v1'
ACCESS_TOKEN = 'your_access_token'

class HakawiAPI:
    def __init__(self, base_url, access_token=None):
        self.base_url = base_url
        self.access_token = access_token
        self.headers = {}
        
        if access_token:
            self.headers['Authorization'] = f'Bearer {access_token}'
    
    def get_stories(self, page=1, limit=20):
        response = requests.get(
            f'{self.base_url}/stories',
            headers=self.headers,
            params={'page': page, 'limit': limit}
        )
        response.raise_for_status()
        return response.json()
    
    def get_story(self, story_id):
        response = requests.get(
            f'{self.base_url}/stories/{story_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def create_story(self, title, content, category):
        response = requests.post(
            f'{self.base_url}/stories',
            headers={**self.headers, 'Content-Type': 'application/json'},
            json={
                'title': title,
                'content': content,
                'category': category
            }
        )
        response.raise_for_status()
        return response.json()
    
    def add_reaction(self, story_id, reaction_type):
        response = requests.post(
            f'{self.base_url}/stories/{story_id}/reactions',
            headers={**self.headers, 'Content-Type': 'application/json'},
            json={'type': reaction_type}
        )
        response.raise_for_status()
        return response.json()

# Usage
api = HakawiAPI(API_BASE, ACCESS_TOKEN)

# Get stories
stories = api.get_stories(1, 20)
print(stories)

# Create a story
story = api.create_story(
    'My Python Story',
    '<p>Story content</p>',
    'fiction'
)
print(story)
```

---

## cURL Examples

### Get Stories

```bash
curl -X GET "https://api.hakawi.com/v1/stories?page=1&limit=20&category=fiction" \
  -H "Accept: application/json"
```

### Get Story with Reactions

```bash
curl -X GET "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000" \
  -H "Accept: application/json"
```

### Create Story

```bash
curl -X POST "https://api.hakawi.com/v1/stories" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My New Story",
    "content": "<p>Story content here</p>",
    "category": "fiction",
    "tags": ["tag1", "tag2"]
  }'
```

### Update Story

```bash
curl -X PUT "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "content": "<p>Updated content</p>"
  }'
```

### Publish Story

```bash
curl -X POST "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000/publish" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Delete Story

```bash
curl -X DELETE "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Add Reaction

```bash
curl -X POST "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000/reactions" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "love"
  }'
```

### Remove Reaction

```bash
curl -X DELETE "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000/reactions" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Create Comment

```bash
curl -X POST "https://api.hakawi.com/v1/stories/123e4567-e89b-12d3-a456-426614174000/comments" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Great story!",
    "parentId": "parent-comment-id" // optional, for replies
  }'
```

### Follow User

```bash
curl -X POST "https://api.hakawi.com/v1/users/123e4567-e89b-12d3-a456-426614174000/follow" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Get Notifications

```bash
curl -X GET "https://api.hakawi.com/v1/notifications?page=1&limit=20&unread=true" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Mark Notification as Read

```bash
curl -X PATCH "https://api.hakawi.com/v1/notifications/123e4567-e89b-12d3-a456-426614174000/read" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Send Message

```bash
curl -X POST "https://api.hakawi.com/v1/messages/conversations/123e4567-e89b-12d3-a456-426614174000/messages" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello there!"
  }'
```

---

## Error Handling Examples

### Validation Error

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ],
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ"
}
```

### Authentication Error

```json
{
  "statusCode": 401,
  "message": "Invalid token",
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ"
}
```

### Authorization Error

```json
{
  "statusCode": 403,
  "message": "You do not have permission to perform this action",
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ"
}
```

### Not Found Error

```json
{
  "statusCode": 404,
  "message": "Story not found",
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ"
}
```

### Rate Limit Error

```json
{
  "statusCode": 429,
  "message": "Too many requests, please try again later",
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ"
}
```

---

## Best Practices

### 1. Always Handle Errors

```typescript
try {
  const story = await api.createStory(data);
} catch (error) {
  console.error('Failed to create story:', error.message);
}
```

### 2. Use Token Refresh

```typescript
async function requestWithRefresh(url: string, options: RequestInit) {
  let response = await fetch(url, options);
  
  if (response.status === 401) {
    await refreshAccessToken();
    response = await fetch(url, options);
  }
  
  return response;
}
```

### 3. Cache Responses

```typescript
const queryClient = new QueryClient();

queryClient.setQueryData(['stories', page], cachedStories);
```

### 4. Debounce Requests

```typescript
import { useDebounce } from 'use-debounce';

const [searchQuery] = useDebounce(query, 300);

useEffect(() => {
  if (searchQuery) {
    api.searchStories(searchQuery);
  }
}, [searchQuery]);
```

---

*This document provides practical examples of using the Hakawi API.*
