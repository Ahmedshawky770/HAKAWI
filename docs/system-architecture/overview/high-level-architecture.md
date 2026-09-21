# System Architecture Overview
## Hakawi - High-Level Architecture

---

## Architecture Vision

Hakawi is built as a **modular monolith** with an **event-driven** internal communication pattern. This architecture provides the simplicity of a single deployable unit while maintaining the flexibility to extract services into microservices in the future.

---

## Architectural Principles

1. **Modular Monolith** - Single deployable unit with clear module boundaries
2. **Event-Driven** - Internal communication via events
3. **Domain-Driven Design** - Modules organized by business domain
4. **Repository Pattern** - Data access abstraction
5. **Single Source of Truth** - One authoritative source per entity

---

## Architecture Patterns

- **Modular Monolith** - Single deployable unit with clear module boundaries
- **Event-Driven Internal Communication** - Loose coupling via event bus
- **Repository Pattern** - Abstraction over data access
- **Service Layer** - Business logic encapsulation
- **Guard/Interceptor/Pipe Pipeline** - NestJS middleware chain
- **SSOT per Bounded Context** - Single source of truth within each module

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Presentation Layer"
        NextJS[Next.js Frontend]
        Mobile[Mobile App<br/>PWA]
    end

    subgraph "Application Layer"
        APIGateway[API Gateway<br/>NestJS]
        Auth[Auth Module]
        Users[Users Module]
        Stories[Stories Module]
        Books[Books Module]
        Contests[Contests Module]
        Notifications[Notifications Module]
        Messages[Messages Module]
        Search[Search Module]
        Moderation[Moderation Module]
        Payments[Payments Module]
    end

    subgraph "Domain Layer"
        UserAggregate[User Aggregate]
        StoryAggregate[Story Aggregate]
        BookAggregate[Book Aggregate]
        ContestAggregate[Contest Aggregate]
        NotificationAggregate[Notification Aggregate]
        MessageAggregate[Message Aggregate]
    end

    subgraph "Infrastructure Layer"
        Database[(PostgreSQL)]
        Cache[(Valkey)]
        Sanity[Sanity CMS]
        Email[Email Service]
        Storage[File Storage]
        Sentry[Sentry]
    end

    NextJS --> APIGateway
    Mobile --> APIGateway

    APIGateway --> Auth
    APIGateway --> Users
    APIGateway --> Stories
    APIGateway --> Books
    APIGateway --> Contests
    APIGateway --> Notifications
    APIGateway --> Messages
    APIGateway --> Search
    APIGateway --> Moderation
    APIGateway --> Payments

    Auth --> UserAggregate
    Users --> UserAggregate
    Stories --> StoryAggregate
    Books --> BookAggregate
    Contests --> ContestAggregate
    Notifications --> NotificationAggregate
    Messages --> MessageAggregate

    UserAggregate --> Database
    StoryAggregate --> Database
    BookAggregate --> Database
    ContestAggregate --> Database
    NotificationAggregate --> Database
    MessageAggregate --> Database

    Auth --> Cache
    Users --> Cache
    Stories --> Cache
    Notifications --> Cache

    Stories --> Sanity
    Auth --> Email
    Books --> Storage
    APIGateway --> Sentry
```

---

## Layer Responsibilities

### Presentation Layer
- **Responsibility:** User interface and user experience
- **Technology:** Next.js, Shadcn UI, Tailwind CSS
- **Concerns:** Routing, state management, UI components

### Application Layer
- **Responsibility:** Application-specific business logic, orchestration
- **Technology:** NestJS modules, controllers, services
- **Concerns:** Use cases, workflows, transactions

### Domain Layer
- **Responsibility:** Core business logic, domain rules
- **Technology:** TypeScript classes, interfaces
- **Concerns:** Entities, value objects, aggregates, domain events

### Infrastructure Layer
- **Responsibility:** Technical implementation details
- **Technology:** PostgreSQL, Valkey, Sanity, Email APIs
- **Concerns:** Persistence, caching, external integrations

---

## Key Architectural Decisions

### 1. Modular Monolith vs Microservices
**Decision:** Modular monolith

**Rationale:**
- Single deployment unit
- Simpler operations
- Easier debugging
- Can extract to microservices later

### 2. Event-Driven Internal Communication
**Decision:** Event bus for module communication

**Rationale:**
- Loose coupling between modules
- Extensibility without modification
- Audit trail via event log
- Easy to add new listeners

### 3. Service Layer Pattern
**Decision:** Service layer for all business logic

**Rationale:**
- Encapsulates business rules
- Reusable across controllers
- Testable in isolation
- Transaction management

### 4. Repository Pattern
**Decision:** Repository pattern for all data access

**Rationale:**
- Abstraction over data source
- Testability
- Flexibility to change data source

### 5. Single Source of Truth
**Decision:** One authoritative source per entity

**Rationale:**
- No data duplication
- Simplified consistency
- Clear ownership

---

## Technology Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **UI Library:** Shadcn UI
- **Styling:** Tailwind CSS
- **State Management:** TanStack Query
- **Language:** TypeScript

### Backend
- **Framework:** NestJS
- **Language:** TypeScript
- **API Style:** REST
- **Validation:** class-validator
- **Authentication:** NestJS Passport strategies
- **Documentation:** Swagger/OpenAPI

### Data
- **Primary Database:** PostgreSQL 15+
- **ORM:** Drizzle ORM
- **Cache:** Valkey (Redis-compatible)
- **Content:** Sanity CMS
- **IDs:** UUID v4

### Infrastructure
- **Containerization:** Docker + Docker Compose
- **Deployment:** Vercel (frontend), Railway/Render (backend)
- **Monitoring:** Sentry
- **Logging:** Winston

---

## Deployment Architecture

```mermaid
graph TB
    subgraph "Production"
        CDN[CDN<br/>Vercel Edge]
        Frontend[Next.js Frontend<br/>Vercel]
        Backend[NestJS Backend<br/>Railway/Render]
        Database[(PostgreSQL<br/>Managed Service)]
        Valkey[(Valkey<br/>Managed Service)]
        Sanity[Sanity CMS<br/>Cloud]
        Sentry[Sentry<br/>Error Tracking]
    end

    subgraph "CI/CD"
        GitHub[GitHub Repository]
        Actions[GitHub Actions]
        Registry[Container Registry]
    end

    subgraph "Development Environment"
        DevFrontend[Next.js Dev Server]
        DevBackend[NestJS Dev Server]
        DevDB[(PostgreSQL Local)]
        DevCache[(Valkey Local)]
        Docker[Docker Compose]
    end

    GitHub --> Actions
    Actions --> Registry
    Registry --> Frontend
    Registry --> Backend

    Frontend --> CDN
    CDN --> Users[End Users]
    Users --> Frontend
    Frontend --> Backend
    Backend --> Database
    Backend --> Valkey
    Backend --> Sanity
    Backend --> Sentry

    Docker --> DevFrontend
    Docker --> DevBackend
    Docker --> DevDB
    Docker --> DevCache
```

---

## Sequence Diagrams

### User Registration Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Cache
    participant Email

    User->>Frontend: Fill registration form
    Frontend->>Backend: POST /auth/register
    Backend->>Database: Check if email exists
    Database-->>Backend: Email available
    Backend->>Database: Create user
    Database-->>Backend: User created
    Backend->>Cache: Store session
    Cache-->>Backend: Session stored
    Backend->>Email: Send welcome email
    Backend-->>Frontend: Return user + tokens
    Frontend-->>User: Registration successful
```

### Story Publishing Flow

```mermaid
sequenceDiagram
    participant Author
    participant Frontend
    participant Backend
    participant Sanity
    participant Database
    participant Search
    participant Notifications

    Author->>Frontend: Publish story
    Frontend->>Backend: POST /stories/:id/publish
    Backend->>Sanity: Update story status
    Sanity-->>Backend: Status updated
    Backend->>Database: Update story metadata
    Database-->>Backend: Updated
    Backend->>Search: Index story
    Backend->>Notifications: Notify followers
    Backend-->>Frontend: Story published
    Frontend-->>Author: Success message
```

### Payment Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Paymob
    participant Database
    participant Notifications

    User->>Frontend: Initiate purchase
    Frontend->>Backend: POST /books/:id/purchase
    Backend->>Database: Create payment record
    Database-->>Backend: Payment created
    Backend->>Paymob: Create payment intent
    Paymob-->>Backend: Payment URL
    Backend-->>Frontend: Return payment URL
    Frontend->>User: Redirect to Paymob
    User->>Paymob: Complete payment
    Paymob->>Backend: Webhook confirmation
    Backend->>Database: Update payment status
    Backend->>Database: Grant access
    Backend->>Notifications: Send confirmation
    Backend-->>Paymob: Webhook acknowledged
```

---

## Infrastructure Diagram

```mermaid
graph TB
    subgraph "Vercel"
        Edge[Edge Network]
        NextJS[Next.js Runtime]
    end

    subgraph "Railway"
        NestJS[NestJS Runtime]
        Docker[Docker Container]
    end

    subgraph "Database"
        Primary[(Primary PostgreSQL)]
        Replica[(Read Replica)]
    end

    subgraph "Cache"
        ValkeyCluster[Valkey Cluster]
    end

    subgraph "External"
        SanityCMS[Sanity CMS]
        PaymobAPI[Paymob API]
        EmailAPI[Email Service]
        Sentry[Sentry]
    end

    Edge --> NextJS
    NextJS --> NestJS
    NestJS --> Primary
    NestJS --> ValkeyCluster
    NestJS --> SanityCMS
    NestJS --> PaymobAPI
    NestJS --> EmailAPI
    NestJS --> Sentry
    Primary --> Replica
```

---

## Network Architecture

```mermaid
graph TB
    subgraph "Public Internet"
        Users[Users]
        CDN[CDN]
    end

    subgraph "DMZ"
        WAF[WAF]
        LoadBalancer[Load Balancer]
    end

    subgraph "Private Network"
        Frontend[Frontend]
        Backend[Backend]
        Database[(Database)]
        Cache[(Cache)]
    end

    subgraph "External Services"
        Sanity[Sanity]
        Paymob[Paymob]
        Sentry[Sentry]
    end

    Users --> CDN
    CDN --> WAF
    WAF --> LoadBalancer
    LoadBalancer --> Frontend
    Frontend --> Backend
    Backend --> Database
    Backend --> Cache
    Backend --> Sanity
    Backend --> Paymob
    Backend --> Sentry
```

---

## Data Flow Diagram

```mermaid
graph LR
    subgraph "Client"
        Browser[Browser]
    end

    subgraph "Edge"
        CDN[CDN]
        WAF[WAF]
    end

    subgraph "Application"
        NextJS[Next.js]
        NestJS[NestJS]
    end

    subgraph "Data"
        Postgres[(PostgreSQL)]
        Valkey[(Valkey)]
        Sanity[(Sanity)]
    end

    subgraph "External"
        OAuth[OAuth Providers]
        Paymob[Paymob]
        Email[Email]
    end

    Browser --> CDN
    CDN --> WAF
    WAF --> NextJS
    NextJS --> NestJS
    NestJS --> Postgres
    NestJS --> Valkey
    NestJS --> Sanity
    NestJS --> OAuth
    NestJS --> Paymob
    NestJS --> Email
```

---

## Scalability Strategy

### Current (Monolith)
- Single NestJS instance
- PostgreSQL with connection pooling
- Valkey for caching

### Future (Scale)
- Horizontal scaling of NestJS instances
- Read replicas for PostgreSQL
- Valkey cluster for cache
- Extract modules to microservices if needed

---

## Observability

- **Logging:** Winston with structured JSON output
- **Error Tracking:** Sentry
- **Metrics:** Custom metrics via Prometheus (future)
- **Tracing:** Correlation IDs across services

---

*This document defines the high-level system architecture for Hakawi.*
