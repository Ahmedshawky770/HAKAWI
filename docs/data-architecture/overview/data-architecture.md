# Data Architecture
## Hakawi - Database Design and Data Flow

---

## Data Architecture Principles

1. **Single Source of Truth** - One authoritative source per entity
2. **Data Ownership** - Each module owns its data
3. **Eventual Consistency** - For non-critical data
4. **Strong Consistency** - For critical data (payments, auth)
5. **Audit Trail** - All mutations logged
6. **Soft Deletes** - No hard deletes in production

---

## Database Architecture

```mermaid
graph TB
    subgraph "PostgreSQL Primary"
        Users[(users)]
        Stories[(stories)]
        Books[(books)]
        Contests[(contests)]
        Interactions[(interactions)]
        Messages[(messages)]
        Notifications[(notifications)]
        Series[(series)]
        Playlists[(playlists)]
        Reports[(reports)]
        Payments[(payments)]
        Settings[(settings)]
    end

    subgraph "Sanity CMS"
        SanityStories[(Story Content)]
        SanityMedia[(Media Assets)]
    end

    subgraph "Valkey Cache"
        UserCache[(User Sessions)]
        StoryCache[(Story Cache)]
        RateLimit[(Rate Limits)]
        WAFState[(WAF State)]
    end

    Users --> Stories : 1:N
    Users --> Books : 1:N
    Users --> Contests : 1:N
    Users --> Interactions : 1:N
    Users --> Messages : 1:N
    Users --> Notifications : 1:N
    Users --> Series : 1:N
    Users --> Playlists : 1:N
    Users --> Reports : 1:N
    Users --> Payments : 1:N

    Stories --> Interactions : 1:N
    Stories --> Comments : 1:N
    Stories --> Reactions : 1:N

    Contests --> Submissions : 1:N
    Contests --> Votes : 1:N
    Contests --> Prizes : 1:N

    SanityStories --> Stories : mirrors
```

---

## Schema Design Principles

1. **UUID Primary Keys** - All entities use UUID v4
2. **Timestamps** - `createdAt` and `updatedAt` on all tables
3. **Soft Deletes** - `deletedAt` timestamp instead of hard delete
4. **Audit Fields** - `createdBy`, `updatedBy` where applicable
5. **Indexing Strategy** - Indexed foreign keys and frequently queried fields
6. **JSONB for Flexibility** - For metadata and flexible data

---

## Core Schemas

### Users Schema
```typescript
// users table
{
  id: uuid (PK)
  googleId: string (unique)
  facebookId: string (unique, nullable)
  twitterId: string (unique, nullable)
  githubId: string (unique, nullable)
  appleId: string (unique, nullable)
  tiktokId: string (unique, nullable)
  username: string (unique)
  email: string (unique)
  name: string
  avatar: string (nullable)
  bio: text (nullable)
  accountType: enum (reader, writer, rising_star, professional, publisher, admin)
  adminRole: enum (nullable)
  isVerified: boolean
  onboardingCompleted: boolean
  accessBlocked: boolean
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Stories Schema
```typescript
// stories table
{
  id: uuid (PK)
  sanityStoryId: string (unique)
  authorId: uuid (FK -> users.id)
  title: string
  slug: string
  description: text
  coverImage: string (nullable)
  status: enum (draft, pending, approved, published, rejected)
  wordCount: number
  readingTime: number
  views: number
  reactions: number
  comments: number
  category: string
  tags: string[]
  createdAt: timestamp
  updatedAt: timestamp
}
```

### Books Schema
```typescript
// books table
{
  id: uuid (PK)
  ownerId: uuid (FK -> users.id)
  title: string
  subtitle: string (nullable)
  authorName: string
  coverImage: string (nullable)
  pdfUrl: string
  pdfPages: number
  price: decimal
  isAvailable: boolean
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

## Data Flow

### Story Publishing Flow
```
1. Author creates story in Sanity CMS
2. Sanity webhook triggers sync service
3. Sync service mirrors to PostgreSQL
4. PostgreSQL stores story metadata
5. Search index updated
6. Notifications sent to followers
```

### Payment Flow
```
1. User initiates payment
2. Backend creates payment intent
3. Paymob processes payment
4. Paymob webhook confirms payment
5. Backend updates payment status
6. Backend grants access (book/rental)
7. Backend triggers notification
8. Analytics updated
```

### Notification Flow
```
1. Event occurs (e.g., story published)
2. Event bus publishes event
3. Notification listener receives event
4. Notification service creates notifications
5. Notifications stored in PostgreSQL
6. Valkey cache updated
7. Real-time push via WebSocket (future)
```

---

## Consistency Model

### Strong Consistency
- Payments
- Authentication
- User account status
- Book availability

### Eventual Consistency
- Story views
- Reaction counts
- Notification counts
- Analytics

### Causal Consistency
- Comments and replies
- Message threads
- Contest submissions

---

*This document defines the data architecture for Hakawi.*
