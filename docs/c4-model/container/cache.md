# Cache Container
## Hakawi C4 - Container View

**Purpose:** Provide low-latency caching for sessions, rate limits, and hot reads.

**Technology:**
- Valkey / Redis-compatible API

**Responsibilities:**
- Auth session cache
- Rate limiting counters
- WAF state
- Hot query caching
- Pub/sub invalidation events

**Deployment:** Docker Compose / hosted Valkey
