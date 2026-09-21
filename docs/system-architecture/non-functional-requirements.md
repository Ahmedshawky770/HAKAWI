# Non-Functional Requirements (NFRs)

## Hakawi - Performance, Reliability, and Scalability Specifications

---

## 1. Overview

This document defines the non-functional requirements for Hakawi. NFRs specify **how** the system should perform, not **what** it should do.

### NFR Categories

1. **Performance** — Response times, throughput, resource utilization
2. **Reliability** — Uptime, error rates, recovery
3. **Scalability** — Horizontal and vertical scaling limits
4. **Security** — Authentication, authorization, data protection
5. **Maintainability** — Code quality, monitoring, debugging
6. **Availability** — Uptime targets, disaster recovery

---

## 2. Performance NFRs

### Response Time Targets

| Endpoint Type | Target | p95 | p99 |
|---------------|--------|-----|-----|
| **Auth endpoints** | < 200ms | < 300ms | < 500ms |
| **Read endpoints** (stories, users) | < 100ms | < 200ms | < 400ms |
| **Write endpoints** (create, update) | < 200ms | < 400ms | < 600ms |
| **Search queries** | < 300ms | < 500ms | < 800ms |
| **Payment webhooks** | < 500ms | < 800ms | < 1000ms |
| **Static assets** | < 100ms | < 200ms | < 300ms |

### Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **API requests/sec** | 1,000 | Per backend instance |
| **Concurrent users** | 10,000 | Simultaneous active users |
| **Database queries/sec** | 5,000 | Per database instance |
| **Cache hit rate** | > 90% | Valkey cache |
| **Webhook processing** | 100/sec | Paymob webhooks |

### Resource Utilization

| Resource | Target | Alert Threshold |
|----------|--------|-----------------|
| **CPU** | < 70% average | > 85% |
| **Memory** | < 80% average | > 90% |
| **Database connections** | < 80% of pool | > 90% |
| **Disk I/O** | < 70% | > 85% |
| **Network bandwidth** | < 70% | > 85% |

---

## 3. Rate Limiting and WAF

### Implementation

**Tool:** `@nestjs/throttler` + custom WAF middleware

### Rate Limits by Endpoint Type

| Endpoint Type | Limit | Window | Scope |
|---------------|-------|--------|-------|
| **Auth endpoints** | 5 requests | 1 minute | Per IP |
| **Auth endpoints** | 10 requests | 1 minute | Per user |
| **API endpoints (authenticated)** | 100 requests | 1 minute | Per user |
| **API endpoints (public)** | 50 requests | 1 minute | Per IP |
| **Payment webhooks** | Unlimited | N/A | Whitelisted IPs |
| **Upload endpoints** | 10 requests | 1 minute | Per user |
| **Search endpoints** | 50 requests | 1 minute | Per IP |
| **Comments** | 30 requests | 1 minute | Per user |

### WAF Rule Examples

**SQL Injection Detection:**
```typescript
const sqlPatterns = [
  /SELECT/i, /INSERT/i, /UPDATE/i, /DELETE/i, /DROP/i,
  /UNION/i, /OR 1=1/i, /AND 1=1/i, /--/i, /#/i,
  /EXEC/i, /EVAL/i, /INTO OUTFILE/i, /SLEEP\(/i
];

if (sqlPatterns.some(pattern => pattern.test(input))) {
  throw new WAFViolationException('SQL injection detected');
}
```

**XSS Detection:**
```typescript
const xssPatterns = [
  /<script>/i, /javascript:/i, /onload=/i, /onerror=/i,
  /<iframe>/i, /<object>/i, /eval\(/i, /alert\(/i
];

if (xssPatterns.some(pattern => pattern.test(input))) {
  throw new WAFViolationException('XSS detected');
}
```

**Path Traversal Detection:**
```typescript
const pathTraversalPatterns = [
  /\.\.\//, /\.\.\\/, /%2e%2e%2f/i, /%2e%2e\//i
];

if (pathTraversalPatterns.some(pattern => pattern.test(input))) {
  throw new WAFViolationException('Path traversal detected');
}
```

### Resource Quotas per User/Tenant

| Resource | Free Tier | Premium Tier | Enterprise |
|----------|-----------|--------------|------------|
| **Stories per month** | 10 | 100 | Unlimited |
| **Books per user** | 5 | 50 | Unlimited |
| **Storage per user** | 100 MB | 1 GB | 10 GB |
| **API requests per minute** | 50 | 200 | 1000 |
| **Concurrent uploads** | 1 | 3 | 10 |
| **Messages per day** | 50 | 500 | Unlimited |
| **Search queries per minute** | 30 | 100 | 500 |

**Enforcement:**
```typescript
// Check user quota before allowing action
async createStory(userId: string) {
  const user = await this.usersRepository.findById(userId);
  const storiesThisMonth = await this.storiesRepository.countThisMonth(userId);
  
  if (storiesThisMonth >= user.quota.storiesPerMonth) {
    throw new QuotaExceededException('Monthly story limit reached');
  }
  
  // ... create story
}
```

### Rate Limiting Strategy

```typescript
// WAF Middleware
@Injectable()
export class ThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    const userId = request.user?.id;
    const endpoint = request.route.path;

    // Get rate limit for endpoint
    const limit = this.getRateLimit(endpoint);
    
    // Check rate limit
    const key = `rate-limit:${userId || ip}:${endpoint}`;
    const current = await this.cache.incr(key);
    
    if (current === 1) {
      await this.cache.expire(key, limit.window);
    }
    
    if (current > limit.requests) {
      throw new ThrottlerException('Too many requests');
    }
    
    return true;
  }
}
```

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700000000
```

---

## 4. Circuit Breaker

### Purpose

Prevent cascade failures when external services are unavailable.

### External Services Requiring Circuit Breakers

| Service | Circuit Breaker | Threshold | Timeout | Fallback |
|---------|----------------|-----------|---------|----------|
| **Sanity CMS** | Yes | 50% failure rate | 5s | Return stub content |
| **Paymob** | Yes | 50% failure rate | 10s | Return "Payment unavailable" |
| **OAuth providers** | Yes | 50% failure rate | 3s | Return "Login unavailable" |
| **Email service** | Yes | 50% failure rate | 5s | Queue email for later |
| **Storage (R2/S3)** | Yes | 50% failure rate | 5s | Return "Upload unavailable" |

### Circuit Breaker States

```
CLOSED (normal) → OPEN (failure) → HALF-OPEN (testing) → CLOSED (recovery)
```

### Implementation

```typescript
@Injectable()
class SanityService {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      fallback: () => ({ content: null, fallback: true }),
    });
  }

  async getStoryContent(storyId: string) {
    return this.circuitBreaker.fire(async () => {
      const response = await fetch(`${SANITY_URL}/documents/story_${storyId}`);
      return response.json();
    });
  }
}
```

### Circuit Breaker Monitoring

| Metric | Alert Threshold |
|--------|----------------|
| **Circuit breaker state changes** | Any OPEN state |
| **Fallback activation rate** | > 10% of requests |
| **Recovery time** | > 5 minutes |

---

## 5. Database Connection Pooling

### PostgreSQL Connection Pool

**Tool:** `pg-pool` (built into node-postgres)

### Configuration

```typescript
// database.config.ts
export const databaseConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  
  // Connection pool settings
  pool: {
    min: 5,              // Minimum connections
    max: 20,             // Maximum connections
    idleTimeoutMillis: 30000,  // Close idle connections after 30s
    connectionTimeoutMillis: 5000,  // Wait 5s for connection
    statement_timeout: 30000,  // Query timeout 30s
  },
};
```

### Connection Pool by Environment

| Environment | Min Connections | Max Connections | Rationale |
|-------------|----------------|----------------|-----------|
| **Development** | 2 | 5 | Low load |
| **Staging** | 5 | 10 | Medium load |
| **Production** | 10 | 20 | High load |
| **Production (scaled)** | 20 | 50 | Very high load |

### Monitoring

| Metric | Target | Alert |
|--------|--------|-------|
| **Active connections** | < 70% of max | > 90% of max |
| **Idle connections** | > 20% of min | < 5% of min |
| **Connection wait time** | < 100ms | > 500ms |
| **Connection errors** | 0 | > 0 |

---

## 6. Valkey TTL and Invalidation Strategy

### Cache TTL by Entity

| Entity | Cache Key Pattern | TTL | Invalidation Trigger | Rationale |
|--------|-------------------|-----|---------------------|-----------|
| **User Session** | `session:{userId}` | 7 days | Logout, password change, security event | Long-lived sessions |
| **User Profile** | `user:profile:{userId}` | 1 hour | Profile update, verification change | Stale data acceptable for 1h |
| **User Statistics** | `user:stats:{userId}` | 1 hour | New story published, new follower | Low freshness requirement |
| **Story Content** | `story:content:{storyId}` | 24 hours | Story update, publish, delete | Content changes infrequently |
| **Story Metadata** | `story:meta:{storyId}` | 5 minutes | Story update, publish, delete | Freshness important for feed |
| **Story Feed** | `feed:{userId}:page:{page}` | 5 minutes | New story published, new follow | Freshness important |
| **Story Views** | `story:views:{storyId}` | 1 minute | New view recorded | Real-time analytics |
| **Search Results** | `search:{query}:page:{page}` | 10 minutes | New content indexed | Balance freshness/performance |
| **Notifications (unread)** | `notifications:unread:{userId}` | 1 minute | New notification created | Real-time feel |
| **Notifications (list)** | `notifications:list:{userId}` | 5 minutes | Notification read, created, deleted | Balance freshness/performance |
| **Rate Limits** | `rate-limit:{key}:{endpoint}` | 1 minute | Window expiration | Security |
| **WAF State** | `waf:block:{ip}` | 5 minutes | Block expires | Security |
| **Trending Stories** | `trending:stories` | 30 minutes | Recalculate | Low freshness requirement |
| **Categories** | `categories:all` | 1 hour | Category added, updated, deleted | Rarely changes |
| **Tags** | `tags:all` | 1 hour | Tag added, removed | Rarely changes |
| **Book Details** | `book:details:{bookId}` | 30 minutes | Book updated, price changed | Balance freshness/performance |
| **User Library** | `library:{userId}` | 5 minutes | New purchase, rental, expiry | Freshness important |
| **Contest Details** | `contest:details:{contestId}` | 10 minutes | Contest updated, status changed | Balance freshness/performance |
| **Contest Submissions** | `contest:submissions:{contestId}` | 5 minutes | New submission, vote cast | Freshness important |
| **Messages (list)** | `messages:{userId}:conversation:{otherId}` | 1 minute | New message sent | Real-time feel |
| **Message Count** | `messages:unread:{userId}` | 1 minute | New message received | Real-time feel |

### Valkey Configuration

```typescript
// cache.config.ts
export const cacheConfig = {
  // Connection
  host: process.env.VALKEY_HOST,
  port: parseInt(process.env.VALKEY_PORT),
  
  // Memory
  maxmemory: '2gb',
  maxmemory-policy: 'allkeys-lru',  // Evict least recently used
  
  // Persistence
  save: {
    '900': 1,    // Save if 1 key changed in 15min
    '300': 10,   // Save if 10 keys changed in 5min
    '60': 10000, // Save if 10000 keys changed in 1min
  },
  
  // Eviction
  eviction-policy: 'volatile-lru',  // Evict keys with TTL first
  
  // Network
  timeout: 5000,
};
```

### Cache Invalidation Rules

#### Tag-based Invalidation

Invalidate all caches for a user or story with a single command:

```typescript
// Invalidate all caches for a user
await cache.invalidateTag(`user:${userId}`);

// Invalidate all caches for a story
await cache.invalidateTag(`story:${storyId}`);

// Invalidate all caches for a contest
await cache.invalidateTag(`contest:${contestId}`);
```

**Tag Mapping:**
```
user:{userId}
├── user:profile:{userId}
├── user:stats:{userId}
├── library:{userId}
├── messages:{userId}:*
└── notifications:*

story:{storyId}
├── story:content:{storyId}
├── story:meta:{storyId}
└── story:views:{storyId}

contest:{contestId}
├── contest:details:{contestId}
└── contest:submissions:{contestId}
```

#### Event-based Invalidation

Subscribe to events and invalidate cache automatically:

```typescript
// User events
this.eventBus.subscribe('user.updated', (event) => {
  cache.invalidateTag(`user:${event.payload.userId}`);
});

this.eventBus.subscribe('user.verified', (event) => {
  cache.invalidate(`user:profile:${event.payload.userId}`);
  cache.invalidate(`user:stats:${event.payload.userId}`);
});

// Story events
this.eventBus.subscribe('story.created', (event) => {
  cache.invalidate(`feed:${event.payload.authorId}`);
  cache.invalidate('trending:stories');
});

this.eventBus.subscribe('story.published', (event) => {
  cache.invalidateTag(`story:${event.payload.storyId}`);
  cache.invalidate(`feed:${event.payload.authorId}`);
  cache.invalidate('trending:stories');
});

this.eventBus.subscribe('story.updated', (event) => {
  cache.invalidateTag(`story:${event.payload.storyId}`);
});

this.eventBus.subscribe('story.deleted', (event) => {
  cache.invalidateTag(`story:${event.payload.storyId}`);
  cache.invalidate(`feed:${event.payload.authorId}`);
});

// Reaction events
this.eventBus.subscribe('reaction.created', (event) => {
  cache.invalidate(`story:meta:${event.payload.targetId}`);
});

// Comment events
this.eventBus.subscribe('comment.created', (event) => {
  cache.invalidate(`story:meta:${event.payload.storyId}`);
});

// Follow events
this.eventBus.subscribe('follow.created', (event) => {
  cache.invalidate(`user:stats:${event.payload.followingId}`);
});

// Book events
this.eventBus.subscribe('book.purchased', (event) => {
  cache.invalidate(`library:${event.payload.buyerId}`);
});

this.eventBus.subscribe('book.rented', (event) => {
  cache.invalidate(`library:${event.payload.renterId}`);
});

// Notification events
this.eventBus.subscribe('notification.created', (event) => {
  cache.invalidate(`notifications:unread:${event.payload.userId}`);
  cache.invalidate(`notifications:list:${event.payload.userId}`);
});

this.eventBus.subscribe('notification.read', (event) => {
  cache.invalidate(`notifications:unread:${event.payload.userId}`);
  cache.invalidate(`notifications:list:${event.payload.userId}`);
});

// Message events
this.eventBus.subscribe('message.created', (event) => {
  cache.invalidate(`messages:unread:${event.payload.recipientId}`);
  // Invalidate conversation cache for both users
  cache.invalidate(`messages:${event.payload.senderId}:conversation:${event.payload.recipientId}`);
  cache.invalidate(`messages:${event.payload.recipientId}:conversation:${event.payload.senderId}`);
});

// Contest events
this.eventBus.subscribe('contest.created', (event) => {
  cache.invalidate(`contest:details:${event.payload.contestId}`);
});

this.eventBus.subscribe('contest.submission_created', (event) => {
  cache.invalidate(`contest:submissions:${event.payload.contestId}`);
});
```

#### Explicit Invalidation

Invalidate cache on write operations:

```typescript
// User service
async updateUser(userId: string, data: UpdateUserDto) {
  await this.repository.update(userId, data);
  await this.cache.invalidateTag(`user:${userId}`);
}

// Story service
async updateStory(storyId: string, data: UpdateStoryDto) {
  await this.repository.update(storyId, data);
  await this.cache.invalidateTag(`story:${storyId}`);
}

async publishStory(storyId: string) {
  await this.repository.update(storyId, { status: 'published' });
  await this.cache.invalidateTag(`story:${storyId}`);
  await this.cache.invalidate(`feed:${authorId}`);
  await this.cache.invalidate('trending:stories');
}

// Notification service
async markAsRead(notificationId: string, userId: string) {
  await this.repository.update(notificationId, { read: true });
  await this.cache.invalidate(`notifications:unread:${userId}`);
  await this.cache.invalidate(`notifications:list:${userId}`);
}
```

#### Cache Warming

Pre-populate cache on application startup or after invalidation:

```typescript
// Warm cache on startup
async warmCache() {
  // Cache categories
  const categories = await this.categoriesRepository.findAll();
  await this.cache.set('categories:all', categories, 3600); // 1 hour

  // Cache tags
  const tags = await this.tagsRepository.findAll();
  await this.cache.set('tags:all', tags, 3600); // 1 hour

  // Cache trending stories
  const trending = await this.storiesRepository.findTrending();
  await this.cache.set('trending:stories', trending, 1800); // 30 minutes
}
```
async updateUser(userId: string, data: UpdateUserDto) {
  await this.repository.update(userId, data);
  await this.cache.invalidateTag(`user:${userId}`);
}
```

---

## 7. Security NFRs

### Authentication & Authorization

| Requirement | Target |
|-------------|--------|
| **Password hashing** | bcrypt with cost factor 12 |
| **JWT expiration** | 15 minutes (access token), 7 days (refresh token) |
| **Session timeout** | 24 hours (remember me), 1 hour (default) |
| **MFA support** | TOTP (Google Authenticator) |
| **OAuth providers** | Google, Apple, Facebook, GitHub, TikTok |

### Data Protection

| Requirement | Implementation |
|-------------|----------------|
| **Encryption at rest** | PostgreSQL TDE, Valkey encryption |
| **Encryption in transit** | TLS 1.3 everywhere |
| **Sensitive data** | Encrypted in database (PII) |
| **Secrets management** | Environment variables, Vault for production |
| **Audit logging** | All sensitive operations logged |

### Rate Limiting

| Requirement | Implementation |
|-------------|----------------|
| **API rate limits** | Per-user and per-IP limits |
| **Login rate limits** | 5 attempts per minute per IP |
| **Password reset** | 3 attempts per hour per email |
| **API key rotation** | Every 90 days |

---

## 8. Availability NFRs

### Uptime Targets

| Environment | Uptime Target | Allowed Downtime |
|-------------|---------------|------------------|
| **Production** | 99.9% | ~8.76 hours/year |
| **Staging** | 99.0% | ~87.6 hours/year |
| **Development** | No SLA | N/A |

### Disaster Recovery

| Metric | Target |
|--------|--------|
| **RPO (Recovery Point Objective)** | 1 hour |
| **RTO (Recovery Time Objective)** | 4 hours |
| **Backup frequency** | Daily full backup, hourly incremental |
| **Backup retention** | 30 days |
| **Cross-region replication** | Yes (future) |

### Backup Strategy

| Data Type | Backup Method | Frequency | Retention |
|-----------|--------------|----------|-----------|
| **PostgreSQL** | pg_dump + WAL archiving | Daily full, hourly incremental | 30 days |
| **Valkey** | RDB snapshot | Every 6 hours | 7 days |
| **Sanity content** | Sanity export | Daily | 30 days |
| **File uploads** | R2/S3 replication | Real-time | 30 days |

---

## 9. Monitoring & Observability NFRs

### Logging

| Requirement | Implementation |
|-------------|----------------|
| **Log format** | Structured JSON |
| **Log level** | debug (dev), info (prod) |
| **Log retention** | 90 days |
| **Correlation IDs** | Required for all requests |
| **Sensitive data** | Never logged (passwords, tokens) |

### Metrics

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| **API response time (p95)** | < 200ms | > 500ms |
| **Error rate** | < 0.1% | > 1% |
| **Database query time (p95)** | < 50ms | > 200ms |
| **Cache hit rate** | > 90% | < 80% |
| **Queue depth** | < 100 | > 500 |
| **CPU utilization** | < 70% | > 85% |
| **Memory utilization** | < 80% | > 90% |

### Tracing

| Requirement | Implementation |
|-------------|----------------|
| **Trace sampling** | 10% of requests |
| **Trace storage** | 7 days |
| **Correlation** | Request ID across all services |

---

## 10. Maintainability NFRs

### Code Quality

| Requirement | Target |
|-------------|--------|
| **Code coverage** | > 80% overall, 90% for critical modules |
| **Cyclomatic complexity** | < 10 per function |
| **Technical debt ratio** | < 5% |
| **Code review coverage** | 100% of changes |

### Documentation

| Requirement | Target |
|-------------|--------|
| **API documentation** | 100% of endpoints |
| **Code comments** | Complex logic only |
| **README** | Every module |
| **Changelog** | Updated with every release |

### Deployment

| Requirement | Target |
|-------------|--------|
| **Deployment frequency** | Multiple per day |
| **Lead time** | < 1 hour |
| **MTTR (Mean Time To Recovery)** | < 1 hour |
| **Change failure rate** | < 5% |

---

## 11. Scalability NFRs

### Horizontal Scaling

| Component | Scaling Strategy | Max Instances |
|-----------|-----------------|---------------|
| **Frontend** | Auto-scale (Vercel) | Unlimited |
| **Backend** | Horizontal pod autoscaling | 10+ instances |
| **PostgreSQL** | Read replicas | 1 primary + 3 replicas |
| **Valkey** | Cluster mode | 3+ nodes |
| **Sanity** | Managed service | Unlimited |

### Vertical Scaling

| Component | Min Spec | Recommended Spec |
|-----------|----------|------------------|
| **Backend instance** | 1 CPU, 2GB RAM | 2 CPU, 4GB RAM |
| **PostgreSQL** | 2 CPU, 4GB RAM | 4 CPU, 8GB RAM |
| **Valkey** | 1 CPU, 2GB RAM | 2 CPU, 4GB RAM |

---

## 12. Summary

### NFR Checklist for Each Phase

| NFR | Phase 1 | Phase 2 | Phase 3 | Phase 4+ |
|-----|---------|---------|---------|----------|
| Response time < 200ms | ✅ | ✅ | ✅ | ✅ |
| Rate limiting implemented | ✅ | ✅ | ✅ | ✅ |
| Circuit breakers configured | ⏭️ | ✅ | ✅ | ✅ |
| Connection pooling tuned | ✅ | ✅ | ✅ | ✅ |
| Valkey TTLs configured | ✅ | ✅ | ✅ | ✅ |
| Monitoring dashboards | ✅ | ✅ | ✅ | ✅ |
| Error tracking (Sentry) | ✅ | ✅ | ✅ | ✅ |
| Backup strategy | ✅ | ✅ | ✅ | ✅ |
| Security audit | ⏭️ | ⏭️ | ✅ | ✅ |
| Load testing | ⏭️ | ⏭️ | ⏭️ | ✅ |

**Legend:**
- ✅ Implemented in this phase
- ⏭️ Deferred to later phase

---

## Related Documentation

- ADR-004: Caching Strategy
- ADR-007: Security Architecture
- ADR-015: Monitoring and Observability
- Deployment Guide: `deployment/deployment.md`

---

*This document defines the non-functional requirements for Hakawi. All NFRs must be met before production launch.*
