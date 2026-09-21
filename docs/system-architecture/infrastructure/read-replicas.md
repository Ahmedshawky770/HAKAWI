# Read Replica Strategy

## Hakawi - Database Read Scaling and Consistency

---

## 1. Purpose

Read replicas scale **read-heavy** workloads horizontally by replicating data from a primary database to one or more read-only replicas.

### When to Use Read Replicas

Read replicas are introduced when:
- **Read queries** exceed **write queries** (target: 10:1 ratio or higher)
- **Read latency** exceeds **100ms** consistently
- **Database CPU** exceeds **70%** due to read load
- **Reporting/analytics** queries impact production performance

### Current Stage

**Phase 1-3 (Weeks 1-7):** Single primary database, no replicas
**Phase 4+ (Weeks 8+):** Introduce read replicas when thresholds are met

---

## 2. Architecture

### Primary-Replica Topology

```
                    ┌─────────────┐
                    │   Primary   │
                    │  (Write)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │ Replica 1 │ │ Replica 2 │ │ Replica 3 │
        │  (Read)   │ │  (Read)   │ │  (Read)   │
        └───────────┘ └───────────┘ └───────────┘
```

### Replication Flow

```
1. Write → Primary (PostgreSQL)
2. Primary → WAL (Write-Ahead Log)
3. WAL → Replicas (logical/physical replication)
4. Replicas → Queries (read-only)
```

---

## 3. Replication Strategy

### PostgreSQL Streaming Replication

**Type:** Physical replication (WAL-based)

**Configuration:**
```sql
-- Primary (postgresql.conf)
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB

-- Replica (postgresql.conf)
hot_standby = on
max_standby_streaming_delay = 30s
```

### Replication Lag

**Target:** < 1 second lag between primary and replicas

**Monitoring:**
```sql
-- Check replication lag
SELECT 
  now() - pg_last_xact_replay_timestamp() AS replication_lag
FROM pg_stat_replication;
```

**Alert Thresholds:**
| Metric | Alert | Critical |
|--------|-------|---------|
| Replication lag | > 5s | > 30s |
| Replica count | < 2 | < 1 |
| Replica CPU | > 70% | > 90% |

---

## 4. Read Routing

### Read/Write Splitting

**Rule:** All **writes** go to primary, all **reads** go to replicas.

### Implementation

```typescript
// database.service.ts
@Injectable()
class DatabaseService {
  private primary: Pool;
  private replicas: Pool[];

  constructor() {
    this.primary = new Pool({ connectionString: process.env.DATABASE_URL });
    this.replicas = [
      new Pool({ connectionString: process.env.DATABASE_REPLICA_1_URL }),
      new Pool({ connectionString: process.env.DATABASE_REPLICA_2_URL }),
    ];
  }

  async query(text: string, params?: any[], options?: QueryOptions) {
    if (options?.write) {
      // Write → Primary
      return this.primary.query(text, params);
    } else {
      // Read → Random replica (round-robin)
      const replica = this.getReplica();
      return replica.query(text, params);
    }
  }

  private getReplica(): Pool {
    const index = Math.floor(Math.random() * this.replicas.length);
    return this.replicas[index];
  }
}
```

### Query Classification

**Write Queries (Primary):**
```typescript
// All queries with these keywords → Primary
const writePatterns = [
  /INSERT/i,
  /UPDATE/i,
  /DELETE/i,
  /CREATE/i,
  /DROP/i,
  /ALTER/i,
];
```

**Read Queries (Replica):**
```typescript
// All other queries → Replica
const readPatterns = [
  /SELECT/i,
];
```

### Explicit Routing

```typescript
// Force write to primary
await db.query('UPDATE users SET ...', [], { write: true });

// Force read from replica
await db.query('SELECT * FROM stories ...', [], { write: false });

// Auto-detect (default)
await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

---

## 5. Consistency Guarantees

### Read Consistency

**Guarantee:** **Eventual consistency** for reads from replicas

**Implications:**
- User updates their profile
- Primary is updated immediately
- Replica may have stale data for up to 1 second
- User may see old profile on next read

**Mitigation:**
```typescript
// After write, read from primary for 1 second
async updateUser(userId: string, data: UpdateUserDto) {
  // Write to primary
  await this.db.query('UPDATE users SET ...', [], { write: true });
  
  // Invalidate cache
  await this.cache.invalidateTag(`user:${userId}`);
  
  // Read from primary (sticky session)
  const user = await this.db.query(
    'SELECT * FROM users WHERE id = $1',
    [userId],
    { write: true, sticky: true }  // Force primary for 1s
  );
  
  return user;
}
```

### Sticky Sessions

**Purpose:** After a write, read from primary for a short period to ensure consistency.

```typescript
// Sticky session map
const stickySessions = new Map<string, number>();

// After write
stickySessions.set(`user:${userId}`, Date.now() + 1000); // 1s sticky

// Before read
const stickyUntil = stickySessions.get(`user:${userId}`);
if (stickyUntil && Date.now() < stickyUntil) {
  // Read from primary
  return this.primary.query(text, params);
} else {
  // Read from replica
  return this.getReplica().query(text, params);
}
```

---

## 6. Use Cases for Replicas

### 1. Read-Heavy Workloads

**Example:** Story feed
```
10,000 reads/sec → 3 replicas (3,333 reads/sec each)
100 writes/sec → 1 primary
```

### 2. Analytics Queries

**Example:** Daily active users report
```sql
-- Run on replica, not primary
SELECT COUNT(DISTINCT user_id) 
FROM story_views 
WHERE created_at >= NOW() - INTERVAL '1 day';
```

### 3. Search Indexing

**Example:** Elasticsearch sync
```typescript
// Sync search index from replica
async syncSearchIndex() {
  const stories = await replica.query('SELECT * FROM stories WHERE ...');
  await elasticsearch.bulkIndex(stories);
}
```

### 4. Reporting

**Example:** Monthly revenue report
```sql
-- Run on replica
SELECT 
  DATE(created_at) as date,
  SUM(amount) as revenue
FROM payments
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY date;
```

---

## 7. Replica Management

### Adding a Replica

```bash
# 1. Create replica from primary backup
pg_basebackup -h primary -D /var/lib/postgresql/replica -U replicator -P --wal-method=stream

# 2. Configure recovery.conf
# primary_conninfo = 'host=primary port=5432 user=replicator'

# 3. Start replica
pg_ctl -D /var/lib/postgresql/replica start

# 4. Verify replication
SELECT * FROM pg_stat_replication;
```

### Removing a Replica

```bash
# 1. Stop replication
pg_ctl -D /var/lib/postgresql/replica stop

# 2. Remove from primary
SELECT pg_detach_replica('replica_host');

# 3. Decommission
```

### Monitoring

| Metric | Target | Alert |
|--------|--------|-------|
| **Replication lag** | < 1s | > 5s |
| **Replica count** | 3 | < 2 |
| **Replica CPU** | < 50% | > 80% |
| **Replica connections** | < 100 | > 200 |

---

## 8. Failover Strategy

### Automatic Failover (Future)

**Tool:** Patroni or repmgr

**Process:**
```
1. Primary fails
2. Patroni detects failure
3. Patroni promotes replica to primary
4. Application connects to new primary
5. Old primary rejoins as replica when recovered
```

### Manual Failover (Current)

```bash
# 1. Stop application
# 2. Promote replica to primary
pg_ctl -D /var/lib/postgresql/replica promote

# 3. Update connection strings
export DATABASE_URL="postgresql://replica:5432/hakawi"

# 4. Start application
# 5. Fix old primary and rejoin as replica
```

### RTO/RPO

| Metric | Target |
|--------|--------|
| **RTO (Recovery Time Objective)** | 5 minutes |
| **RPO (Recovery Point Objective)** | 1 second (replication lag) |

---

## 9. Connection Pooling with Replicas

### PgBouncer Configuration

```ini
# pgbouncer.ini
[databases]
hakawi = host=primary port=5432 dbname=hakawi

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
```

### Application Configuration

```typescript
// Use PgBouncer for connection pooling
const config = {
  host: process.env.PGBOUNCER_HOST,
  port: 6432,  // PgBouncer port
  database: 'hakawi',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
```

---

## 10. Implementation Timeline

### Phase 1 (Weeks 1-7): Single Primary

- No replicas
- Single database instance
- Monitor performance metrics

### Phase 2 (Weeks 8-12): Introduce Replicas

- Add 1 replica for read scaling
- Implement read/write splitting
- Monitor replication lag

### Phase 3 (Weeks 13-16): Scale Replicas

- Add 2 more replicas (3 total)
- Implement sticky sessions
- Add replica monitoring dashboards

### Phase 4 (Post-Launch): Advanced Features

- Automatic failover
- Cross-region replication
- Read replica for analytics

---

## 11. Monitoring Dashboard

### Metrics to Track

1. **Replication lag** — Time between primary write and replica read
2. **Replica CPU/Memory** — Resource utilization
3. **Query distribution** — % reads vs writes
4. **Connection count** — Active connections per replica
5. **Query latency** — p95, p99 for reads

### Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| **Replication lag high** | > 5s | Check network, replica health |
| **Replica down** | Replica unreachable | Investigate, consider failover |
| **Replica CPU high** | > 80% | Scale replica or add more replicas |
| **Primary CPU high** | > 85% | Scale primary or add replicas |

---

## Related Documentation

- ADR-003: Database Schema Design
- ADR-004: Caching Strategy
- Deployment Guide: `deployment/deployment.md`
- Non-Functional Requirements: `system-architecture/non-functional-requirements.md`

---

*This document defines the read replica strategy for Hakawi. Read replicas are introduced when read-heavy workloads require horizontal scaling.*
