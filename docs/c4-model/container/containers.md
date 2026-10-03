# C4 Level 2: Container Diagram
## Hakawi - Technical Building Blocks

---

## Container Diagram

```mermaid
graph TB
    subgraph "Frontend Container"
        direction TB
        NextApp[Next.js 16.3.5 App<br/>App Router]
        UI[components/ui<br/>5 hand-written components]
        TanStack[TanStack Query]
        Tailwind[Tailwind CSS 4]
    end

    subgraph "Backend Container"
        direction TB
        NestJS[NestJS Application]
        AuthModule[Auth Module]
        UsersModule[Users Module]
        StoriesModule[Stories Module]
        BooksModule[Books Module]
        ContestsModule[Contests Module]
        NotificationsModule[Notifications Module]
        MessagesModule[Messages Module]
        SearchModule[Search Module]
        ModerationModule[Moderation Module]
        PaymentsModule[Payments Module]
        SharedKernel[Shared Kernel]
    end

    subgraph "Data Containers"
        direction TB
        PostgreSQL[(PostgreSQL<br/>Primary Database)]
        Valkey[(Valkey<br/>Cache Layer)]
        SanityCMS[Sanity CMS<br/>Story Content]
    end

    subgraph "Infrastructure"
        direction TB
        Docker[Docker Compose]
        MessageQueue[Event Bus<br/>Internal]
        Logger[Winston Logger]
        Sentry[Sentry]
    end

    NextApp -->|REST API| NestJS
    NextApp -->|GROQ| SanityCMS
    NestJS -->|SQL| PostgreSQL
    NestJS -->|Redis Protocol| Valkey
    NestJS -->|GROQ| SanityCMS
    NestJS -->|Events| MessageQueue
    NestJS -->|Logs| Logger
    NestJS -->|Errors| Sentry
```

---

## Frontend Container

### Next.js Application
- **Technology:** **Next.js 16.3.5** with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **State Management:** TanStack Query + Server Components
- **Features:**
  - Server-side rendering (SSR)
  - Static site generation (SSG)
  - API routes (minimal)
  - PWA support (future)

### Key Components
| Component | Purpose | Technology |
|-----------|---------|------------|
| **App Router** | Routing and layouts | Next.js App Router |
| **`components/ui/`** | UI components | ⚠️ **5 hand-written components** — `Button`, `Card`, `ErrorMessage`, `Input`, `Loading` — plus `components/story/StoryMeta.tsx`. **Shadcn and Radix are NOT installed**; there is no `components.json` and no `@radix-ui/*` dependency |
| **TanStack Query** | Server state management | React Query |
| **Tailwind CSS 4** | Styling | Utility-first CSS |
| **`lib/schemas.ts`** | Response validation | ⚠️ **~50 Zod schemas** validating every API response; `lib/api.ts` has **no blind `as` casts** |

> **Correction:** this document previously said "Next.js 14" at line 64 and "Shadcn UI / Radix UI" at
> lines 66 and 78, and `docs/system-architecture/overview/high-level-architecture.md` contradicted
> itself by saying "Next.js 16" at line 190 and "Next.js" without a version at line 120. The
> installed version is **16.3.5** (`frontend/package.json`) and is now stated consistently.

---

## Backend Container

### NestJS Application
- **Technology:** NestJS (Node.js + TypeScript)
- **Architecture:** Modular monolith
- **API Style:** REST
- **Features:**
  - Dependency injection
  - Guards and interceptors
  - Validation pipes
  - Exception filters
  - Swagger/OpenAPI docs

### Modules

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| **Auth** | Authentication, authorization | Users, Permissions |
| **Users** | User management, profiles | Database, Cache |
| **Stories** | Story CRUD, publishing | Sanity, Database |
| **Books** | Book sales, rentals | Payments, Database |
| **Contests** | Contest management | Users, Stories |
| **Notifications** | In-app notifications | Database, Cache |
| **Messages** | Direct messaging | Database |
| **Search** | Full-text search | Database, Sanity |
| **Moderation** | Content moderation | Database, WAF |
| **Payments** | Payment processing | Paymob, Database |

---

## Data Containers

### PostgreSQL
- **Technology:** PostgreSQL 15+
- **ORM:** Drizzle ORM
- **Purpose:** Primary data store for relational data
- **Data:** Users, interactions, transactions, notifications, messages, reports

### Valkey
- **Technology:** Valkey (Redis-compatible)
- **Purpose:** Caching layer
- **Features:**
  - Session cache
  - Rate limiting
  - WAF state
  - Query result cache

### Sanity CMS
- **Technology:** Sanity.io
- **Purpose:** Story content management
- **Features:**
  - Rich text editing
  - Media management
  - GROQ queries
  - Real-time collaboration

---

## Infrastructure

### Docker Compose
- **Purpose:** Local development orchestration
- **Services:**
  - PostgreSQL
  - Valkey
  - Adminer (DB management)

### Event Bus
- **Technology:** EventEmitter2 (lightweight)
- **Purpose:** Internal event-driven communication
- **Events:** UserCreated, StoryPublished, ContestCreated, etc.

### Logger
- **Technology:** Winston
- **Purpose:** Structured logging
- **Features:**
  - Log levels
  - Correlation IDs
  - JSON output

### Sentry
- **Purpose:** Error tracking and monitoring
- **Features:**
  - Error aggregation
  - Performance monitoring
  - Release tracking

---

## Communication Patterns

### Synchronous
- Frontend → Backend: REST API calls
- Backend → PostgreSQL: SQL queries via Drizzle
- Backend → Valkey: Redis protocol
- Backend → Sanity: GROQ queries

### Asynchronous
- Backend → Event Bus: Internal events
- Backend → Email: SMTP/API
- Backend → Sentry: Error reports

---

## Scalability Considerations

- **Frontend:** CDN, edge caching
- **Backend:** Horizontal scaling (stateless)
- **Database:** Read replicas, connection pooling
- **Cache:** Valkey cluster (future)
- **Sanity:** Managed service (auto-scaling)

---

*This document defines the container architecture for Hakawi.*
